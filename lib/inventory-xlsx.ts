import 'server-only'
import { Buffer } from 'node:buffer'
import * as XLSX from 'xlsx'
import { fromBuffer } from 'yauzl'
import { validateInventoryImport, type DuplicateChoice, type InventoryImportResult } from './inventory-import'

// Resource limits, not product/warehouse limits. Increase only with load tests.
export const INVENTORY_FILE_LIMITS = {
  bytes: 4 * 1024 * 1024,
  expandedBytes: 32 * 1024 * 1024,
  zipEntries: 500,
  rows: 50000,
} as const

export class InventoryFileError extends Error {}

/** Inspect compressed XLSX contents before handing them to the synchronous parser. */
async function checkXlsxContainer(buffer: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) return reject(new InventoryFileError('The file is not a valid XLSX workbook.'))
      let settled = false
      let entries = 0
      let declaredBytes = 0
      let actualBytes = 0
      let xmlCells = 0
      const names = new Set<string>()
      const fail = (message: string) => {
        if (settled) return
        settled = true
        zip.close()
        reject(new InventoryFileError(message))
      }
      zip.on('error', () => fail('The XLSX archive is damaged or unsupported.'))
      zip.on('entry', entry => {
        if (settled) return
        entries++
        declaredBytes += entry.uncompressedSize
        if (entries > INVENTORY_FILE_LIMITS.zipEntries ||
            declaredBytes > INVENTORY_FILE_LIMITS.expandedBytes) {
          return fail('The expanded workbook exceeds the safe import size.')
        }
        if (names.has(entry.fileName)) return fail('The workbook contains duplicate archive entries.')
        names.add(entry.fileName)
        if (entry.isEncrypted() || /vbaProject\.bin$/i.test(entry.fileName) ||
            entry.fileName.startsWith('xl/embeddings/')) {
          return fail('Encrypted workbooks, macros and embedded files are not supported.')
        }
        if (entry.fileName.endsWith('/')) { zip.readEntry(); return }
        zip.openReadStream(entry, (streamError, stream) => {
          if (settled) { stream?.destroy(); return }
          if (streamError || !stream) return fail('The XLSX archive cannot be read.')
          let cellTagTail = ''
          stream.on('error', () => fail('The XLSX archive is damaged or unsupported.'))
          stream.on('data', (chunk: Buffer) => {
            if (/\.xml$/i.test(entry.fileName)) {
              const text = cellTagTail + chunk.toString('utf8')
              xmlCells += (text.match(/<c(?=[\s/>:])/g) ?? []).length
              cellTagTail = text.slice(-2)
              if (xmlCells > (INVENTORY_FILE_LIMITS.rows + 1) * 13) {
                stream.destroy()
                return fail('The workbook exceeds the safe cell count.')
              }
            }
            actualBytes += chunk.length
            if (actualBytes > INVENTORY_FILE_LIMITS.expandedBytes) {
              stream.destroy()
              fail('The expanded workbook exceeds the safe import size.')
            }
          })
          stream.on('end', () => { if (!settled) zip.readEntry() })
        })
      })
      zip.on('end', () => {
        if (settled) return
        if (!names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) {
          return fail('Use an XLSX workbook, not another ZIP file.')
        }
        settled = true
        resolve()
      })
      zip.readEntry()
    })
  })
}

export async function readInventoryXlsx(
  bytes: Uint8Array,
  filename: string,
  choices: readonly DuplicateChoice[] = [],
): Promise<InventoryImportResult> {
  if (!/\.xlsx$/i.test(filename)) throw new InventoryFileError('Select an .xlsx file.')
  if (!bytes.byteLength || bytes.byteLength > INVENTORY_FILE_LIMITS.bytes) {
    throw new InventoryFileError('The XLSX file must be non-empty and at most 4 MiB.')
  }
  const buffer = Buffer.from(bytes)
  await checkXlsxContainer(buffer)
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer', cellFormula: true, cellDates: true, cellNF: true,
      cellHTML: false, cellText: true,
    })
  } catch {
    throw new InventoryFileError('The workbook could not be read. Save it again as .xlsx.')
  }
  if (workbook.SheetNames.length !== 1) {
    throw new InventoryFileError('Use one worksheet per inventory file.')
  }
  if (workbook.Workbook?.Sheets?.[0]?.Hidden) {
    throw new InventoryFileError('The inventory worksheet must be visible.')
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new InventoryFileError('No inventory worksheet was found.')
  if (sheet['!merges']?.length) throw new InventoryFileError('Unmerge the cells before importing.')
  // Never truncate to N rows during parsing: a malformed declared range must not
  // hide later products. Bounded archive/cell sizes are checked before parsing.
  for (const ref of [sheet['!ref'], sheet['!fullref']]) {
    if (ref && XLSX.utils.decode_range(ref).e.r > INVENTORY_FILE_LIMITS.rows) {
      throw new InventoryFileError('The workbook exceeds 50,000 product rows.')
    }
  }

  // Inspect actual cells as well as !ref, so malformed ranges cannot hide data.
  const matrix: unknown[][] = [Array.from({ length: 13 }, (_, c) => {
    const value = sheet[XLSX.utils.encode_cell({ r: 0, c })]?.v
    return typeof value === 'string' ? value.trim() : value ?? ''
  })]
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!') || !cell) continue
    const position = XLSX.utils.decode_cell(address)
    if (position.r > INVENTORY_FILE_LIMITS.rows || position.c >= 13) {
      if (cell.v != null || cell.f || cell.F) throw new InventoryFileError('Data exists outside the inventory table limits.')
      continue
    }
    if (cell.f != null || cell.F != null) {
      throw new InventoryFileError('Replace the formula in ' + address + ' with its value before importing.')
    }
    if (cell.t === 'e' || cell.t === 'd') {
      throw new InventoryFileError('Correct the error or date value in ' + address + '.')
    }
    while (matrix.length <= position.r) matrix.push([])
    const rawHeader = matrix[0][position.c]
    const header = typeof rawHeader === 'string' ? rawHeader.trim() : rawHeader
    const numericField = header === 'BPU' || header === 'Pallet Size' || header === 'Weight AVG'
    let value: unknown = cell.v ?? ''
    if (position.r > 0 && !numericField && header !== 'Status' && cell.t === 'n') {
      if (!Number.isSafeInteger(cell.v) || Math.abs(cell.v) > 999999999999999) {
        throw new InventoryFileError('Store the identifier in ' + address + ' as text to avoid Excel precision loss.')
      }
      // Only zero-padding is unambiguous for numeric identifiers. General numbers
      // use their full integer value, not scientific notation or thousands formatting.
      value = typeof cell.z === 'string' && /^0+$/.test(cell.z)
        ? XLSX.utils.format_cell(cell)
        : String(cell.v)
    }
    matrix[position.r][position.c] = value
  }
  // Sparse array holes must become explicit blanks for header validation.
  for (let index = 0; index < matrix.length; index++) matrix[index] = Array.from(matrix[index])
  return validateInventoryImport(matrix, choices)
}
