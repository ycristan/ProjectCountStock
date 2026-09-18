/**
 * New inventory format, not yet wired to the production importer.
 * Pure validation: no database, authentication, filesystem or side effects.
 * The future server action must rerun this validation before its transaction.
 */
export const INVENTORY_HEADERS = [
  'Brand Code', 'Brand Name', 'Category', 'Category1', 'BPU',
  'Pallet Size', 'Weight AVG', 'BIN Location 1', 'BIN Location 2',
  'BIN Location 3', 'BIN Location 4', 'Status', 'WHS',
] as const

export type InventoryHeader = typeof INVENTORY_HEADERS[number]
export type InventoryImportItem = {
  sourceRow: number
  brand_code: string
  brand_name: string
  category: string
  category1: string
  bpu: number
  pallet_size: number
  weight_avg: number
  bins: string[]
  brand_active: boolean
}
export type ImportIssue = {
  row: number
  column?: InventoryHeader
  message: string
}
export type DuplicateChoice = { brandCode: string; row: number }
export type DuplicateGroup = {
  brandCode: string
  candidates: { row: number; cells: unknown[] }[]
}
export type InventoryImportResult =
  | { ok: true; warehouseName: string; warehouseKey: string; items: InventoryImportItem[] }
  | { ok: false; issues: ImportIssue[]; duplicates: DuplicateGroup[] }

export function warehouseKey(name: string): string {
  return name.trim().toLowerCase()
}

const empty = (value: unknown) =>
  value == null || (typeof value === 'string' && value.trim() === '')

// Do not coerce objects, booleans or unsafe numbers into identifiers.
function textCell(value: unknown): string | null {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  return empty(value) ? '' : null
}

function numberCell(value: unknown, integer: boolean, minimum: number, optional = false): number | null {
  if (empty(value)) return optional ? 0 : null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  // Numeric spreadsheet cells are preferred. Text must be unambiguous decimal notation.
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum) return null
  if (integer && (!Number.isInteger(number) || number > 2147483647)) return null
  return number
}

/**
 * Input is a matrix retaining physical rows (header at row 1, no blank-row removal).
 * An XLSX adapter must preserve formatted identifiers, reject formula/error cells
 * and enforce file/decompression limits before calling this function.
 * Choices identify a physical row, never "first/last wins".
 */
export function validateInventoryImport(
  matrix: readonly (readonly unknown[])[],
  choices: readonly DuplicateChoice[] = [],
): InventoryImportResult {
  const issues: ImportIssue[] = []
  const duplicates: DuplicateGroup[] = []
  const fail = (): InventoryImportResult => ({ ok: false, issues, duplicates })
  const header = matrix[0]
  if (!header) {
    issues.push({ row: 1, message: 'The spreadsheet is empty.' })
    return fail()
  }

  const positions = new Map<InventoryHeader, number>()
  header.forEach((value, index) => {
    const name = typeof value === 'string' ? value.trim() : ''
    if (!(INVENTORY_HEADERS as readonly string[]).includes(name)) {
      issues.push({ row: 1, message: 'Unknown or empty header in column ' + (index + 1) + '.' })
    } else if (positions.has(name as InventoryHeader)) {
      issues.push({ row: 1, column: name as InventoryHeader, message: 'Duplicate header: ' + name + '.' })
    } else {
      positions.set(name as InventoryHeader, index)
    }
  })
  for (const name of INVENTORY_HEADERS) {
    if (!positions.has(name)) issues.push({ row: 1, column: name, message: 'Missing column: ' + name + '.' })
  }
  if (issues.length) return fail()

  const valueAt = (row: readonly unknown[], name: InventoryHeader) => row[positions.get(name)!]
  const rows: { row: number; cells: readonly unknown[]; code: string | null }[] = []
  let warehouseName = ''
  let key = ''
  matrix.slice(1).forEach((cells, index) => {
    if (cells.every(empty)) return
    const row = index + 2
    if (cells.slice(header.length).some(value => !empty(value))) {
      issues.push({ row, message: 'Values found outside the defined columns.' })
    }
    const name = textCell(valueAt(cells, 'WHS'))
    if (!name) {
      issues.push({ row, column: 'WHS', message: 'WHS is required.' })
    } else if (!warehouseName) {
      warehouseName = name
      key = warehouseKey(name)
    } else if (warehouseKey(name) !== key) {
      issues.push({ row, column: 'WHS', message: 'Use one warehouse per spreadsheet.' })
    }
    rows.push({ row, cells, code: textCell(valueAt(cells, 'Brand Code')) })
  })
  if (!rows.length) issues.push({ row: 2, message: 'At least one product is required; an empty file cannot deactivate inventory.' })

  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    if (!row.code) continue
    const group = groups.get(row.code)
    if (group) group.push(row)
    else groups.set(row.code, [row])
  }
  const selected = new Map<string, number>()
  for (const choice of choices) {
    const group = groups.get(choice.brandCode)
    if (selected.has(choice.brandCode) || !group || group.length < 2 ||
        !group.some(candidate => candidate.row === choice.row)) {
      issues.push({ row: 1, column: 'Brand Code', message: 'Invalid or stale duplicate selection. Review the duplicate rows again.' })
    } else selected.set(choice.brandCode, choice.row)
  }
  for (const [brandCode, group] of groups) {
    if (group.length > 1 && !selected.has(brandCode)) {
      duplicates.push({ brandCode, candidates: group.map(candidate => ({
        row: candidate.row,
        // Keep the original column order for the UI; never mutate the source matrix.
        cells: [...candidate.cells],
      })) })
    }
  }

  const items: InventoryImportItem[] = []
  for (const source of rows) {
    if (source.code && (groups.get(source.code)?.length ?? 0) > 1 &&
        selected.get(source.code) !== source.row) continue
    const { row, cells } = source
    const before = issues.length
    const requiredText = (column: InventoryHeader): string => {
      const value = textCell(valueAt(cells, column))
      if (!value) issues.push({ row, column, message: column + ' is required and must be text or a safe whole number.' })
      return value ?? ''
    }
    const brand_code = requiredText('Brand Code')
    const brand_name = requiredText('Brand Name')
    const category = requiredText('Category')
    const category1 = requiredText('Category1')
    const bpu = numberCell(valueAt(cells, 'BPU'), true, 1)
    const pallet_size = numberCell(valueAt(cells, 'Pallet Size'), true, 0, true)
    const weight_avg = numberCell(valueAt(cells, 'Weight AVG'), false, 0, true)
    if (bpu === null) issues.push({ row, column: 'BPU', message: 'BPU must be a whole number of at least 1.' })
    if (pallet_size === null) issues.push({ row, column: 'Pallet Size', message: 'Pallet Size must be blank or a non-negative whole number.' })
    if (weight_avg === null) issues.push({ row, column: 'Weight AVG', message: 'Weight AVG must be blank or a finite non-negative number in grams.' })
    const rawStatus = valueAt(cells, 'Status')
    const status = typeof rawStatus === 'string' ? rawStatus.trim().toUpperCase() : rawStatus
    const brand_active = status === true || status === 'TRUE'
    if (status !== true && status !== false && status !== 'TRUE' && status !== 'FALSE') {
      issues.push({ row, column: 'Status', message: 'Status must be TRUE or FALSE.' })
    }
    const bins: string[] = []
    for (const column of ['BIN Location 1', 'BIN Location 2', 'BIN Location 3', 'BIN Location 4'] as const) {
      const bin = textCell(valueAt(cells, column))
      if (bin === null) issues.push({ row, column, message: column + ' must be text or a safe whole number.' })
      else if (bin && !bins.includes(bin)) bins.push(bin)
    }
    if (issues.length === before && bpu !== null && pallet_size !== null && weight_avg !== null) {
      items.push({ sourceRow: row, brand_code, brand_name, category, category1,
        bpu, pallet_size, weight_avg, bins, brand_active })
    }
  }
  // Never expose a partial writable payload when any line/choice is invalid.
  if (issues.length || duplicates.length) return fail()
  return { ok: true, warehouseName, warehouseKey: key, items }
}

/** Produce the approved upload column order, with explicit boolean Status and text codes. */
export function inventoryExportRows(
  warehouseName: string,
  items: readonly Omit<InventoryImportItem, 'sourceRow'>[],
): unknown[][] {
  return [
    [...INVENTORY_HEADERS],
    ...items.map(item => [
      item.brand_code, item.brand_name, item.category, item.category1, item.bpu,
      item.pallet_size, item.weight_avg,
      item.bins[0] ?? '', item.bins[1] ?? '', item.bins[2] ?? '', item.bins[3] ?? '',
      item.brand_active, warehouseName.trim(),
    ]),
  ]
}
