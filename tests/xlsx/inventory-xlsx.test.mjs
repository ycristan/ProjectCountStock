import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Buffer } from 'node:buffer'
import { crc32, deflateRawSync } from 'node:zlib'
import * as XLSX from 'xlsx'
import * as yauzl from 'yauzl'
import { loadSource } from '../inventory/source-fixture.mjs'

const format = await loadSource('lib/inventory-import.ts')
const { readInventoryXlsx, INVENTORY_FILE_LIMITS } = await loadSource('lib/inventory-xlsx.ts', {
  'server-only': {}, 'node:buffer': { Buffer }, xlsx: XLSX, yauzl,
  './inventory-import': format,
})
const headers = [...format.INVENTORY_HEADERS]
// Exactly 13 columns. Keep the test row in approved order.
const dataRow = ['006323','Coca-Cola','Drinks','Cans',24,0,330,'40B','','','',false,'Main']
function workbook(rows = [dataRow]) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Inventory')
  return wb
}
const bytes = wb => XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })
const read = wb => readInventoryXlsx(bytes(wb), 'inventory.xlsx')
const plain = value => JSON.parse(JSON.stringify(value))

test('real XLSX preserves inactive product and leading zero text', async () => {
  const result = await read(workbook())
  assert.equal(result.ok, true)
  assert.equal(result.items[0].brand_code, '006323')
  assert.equal(result.items[0].brand_active, false)
  assert.equal(result.items[0].weight_avg, 330)
})
test('numeric code with Excel zero-padding preserves displayed code', async () => {
  const wb = workbook()
  wb.Sheets.Inventory.A2 = { t: 'n', v: 6323, z: '000000' }
  assert.equal((await read(wb)).items[0].brand_code, '006323')
})
test('blank optional cells accepted in a real workbook', async () => {
  const values = [...dataRow]
  values[5] = ''; values[6] = ''
  const result = await read(workbook([values]))
  assert.equal(result.ok, true)
  assert.equal(result.items[0].pallet_size, 0)
  assert.equal(result.items[0].weight_avg, 0)
})
test('reordered headers and values read by name', async () => {
  const wb = workbook()
  wb.Sheets.Inventory = XLSX.utils.aoa_to_sheet([[...headers].reverse(), [...dataRow].reverse()])
  assert.deepEqual(plain(await read(wb)), plain(await read(workbook())))
})
test('numeric BPU stays numeric despite display formatting', async () => {
  const wb = workbook()
  wb.Sheets.Inventory.E2.z = '0.00'
  const result = await read(wb)
  assert.equal(result.ok, true)
  assert.equal(result.items[0].bpu, 24)
})
test('formula with cached result is rejected, not silently trusted', async () => {
  const wb = workbook()
  wb.Sheets.Inventory.E2 = { t: 'n', f: '12*2', v: 24 }
  await assert.rejects(read(wb), /formula in E2/)
})
test('Excel error cells rejected', async () => {
  const wb = workbook()
  wb.Sheets.Inventory.G2 = { t: 'e', v: 7 }
  await assert.rejects(read(wb), /error or date value in G2/)
})
test('dates cannot become Brand Codes accidentally', async () => {
  const wb = workbook()
  wb.Sheets.Inventory.A2 = { t: 'n', v: 45000, z: 'yyyy-mm-dd' }
  await assert.rejects(read(wb), /error or date value in A2/)
})
test('numeric codes beyond Excel precision rejected', async () => {
  const wb = workbook()
  wb.Sheets.Inventory.A2 = { t: 'n', v: 1234567890123456 }
  await assert.rejects(read(wb), /as text/)
})
test('long codes stored as text preserved', async () => {
  const values = [...dataRow]; values[0] = '123456789012345678901'
  assert.equal((await read(workbook([values]))).items[0].brand_code, values[0])
})
test('duplicate physical row choices survive actual XLSX roundtrip', async () => {
  const wb = workbook([dataRow, [], [...dataRow]])
  const first = await read(wb)
  assert.equal(first.ok, false)
  assert.deepEqual(plain(first.duplicates[0].candidates.map(c => c.row)), [2,4])
  const chosen = await readInventoryXlsx(bytes(wb), 'test.xlsx', [{ brandCode: '006323', row: 4 }])
  assert.equal(chosen.ok, true)
  assert.equal(chosen.items[0].sourceRow, 4)
})
test('mixed WHS blocked in actual XLSX', async () => {
  const other = [...dataRow]; other[0] = 's'; other[12] = 'Service'
  assert.equal((await read(workbook([dataRow, other]))).ok, false)
})
test('extra worksheet not silently ignored', async () => {
  const wb = workbook()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['something']]), 'Other')
  await assert.rejects(read(wb), /one worksheet/)
})
test('hidden worksheet rejected', async () => {
  const wb = workbook(); wb.Workbook = { Sheets: [{ Hidden: 1 }] }
  await assert.rejects(read(wb), /visible/)
})
test('merged cells rejected', async () => {
  const wb = workbook(); wb.Sheets.Inventory['!merges'] = [{ s:{ r:1,c:1 }, e:{ r:1,c:2 } }]
  await assert.rejects(read(wb), /Unmerge/)
})
test('oversized physical row cannot become a partial import', async () => {
  const wb = workbook()
  XLSX.utils.sheet_add_aoa(wb.Sheets.Inventory, [dataRow], { origin: 'A50002' })
  await assert.rejects(read(wb), /50,000|limits/)
})
test('extra data column rejected rather than discarded', async () => {
  const wb = workbook()
  XLSX.utils.sheet_add_aoa(wb.Sheets.Inventory, [['unexpected']], { origin: 'N2' })
  await assert.rejects(read(wb), /limits/)
})
test('wrong extension, empty, corrupt and oversized files rejected', async () => {
  await assert.rejects(readInventoryXlsx(bytes(workbook()), 'file.csv'), /.xlsx/)
  await assert.rejects(readInventoryXlsx(Buffer.alloc(0), 'file.xlsx'), /non-empty/)
  await assert.rejects(readInventoryXlsx(Buffer.from('not a zip'), 'file.xlsx'), /valid XLSX/)
  await assert.rejects(readInventoryXlsx(Buffer.alloc(INVENTORY_FILE_LIMITS.bytes+1), 'file.xlsx'), /4 MiB/)
})
test('truncated archive rejected without parser/database access', async () => {
  const buffer = bytes(workbook())
  await assert.rejects(readInventoryXlsx(buffer.subarray(0,buffer.length-20), 'file.xlsx'), /valid XLSX|damaged/)
})
test('export data to real XLSX then reimport preserves all approved fields', async () => {
  const input = await read(workbook())
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(format.inventoryExportRows(input.warehouseName,input.items)), 'Inventory')
  assert.deepEqual(plain(await read(wb)),plain(input))
})

// Synthetic archives for negative tests; never used by production code.
function archive(entries) {
  const local = [], central = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const data = Buffer.from(entry.data ?? '')
    const compressed = deflateRawSync(data)
    const size = entry.declaredSize ?? data.length
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50,0); header.writeUInt16LE(20,4)
    header.writeUInt16LE(8,8); header.writeUInt32LE(crc32(data),14)
    header.writeUInt32LE(compressed.length,18); header.writeUInt32LE(size,22)
    header.writeUInt16LE(name.length,26)
    local.push(header,name,compressed)
    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50,0); record.writeUInt16LE(20,4); record.writeUInt16LE(20,6)
    record.writeUInt16LE(8,10); record.writeUInt32LE(crc32(data),16)
    record.writeUInt32LE(compressed.length,20); record.writeUInt32LE(size,24)
    record.writeUInt16LE(name.length,28); record.writeUInt32LE(offset,42)
    central.push(record,name)
    offset += header.length+name.length+compressed.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(entries.length,8)
  end.writeUInt16LE(entries.length,10); end.writeUInt32LE(directory.length,12)
  end.writeUInt32LE(offset,16)
  return Buffer.concat([...local,directory,end])
}
test('small compressed archive with excessive expanded size rejected before XLSX parsing', async () => {
  const input = archive([{ name:'xl/worksheets/sheet1.xml',
    data:Buffer.alloc(INVENTORY_FILE_LIMITS.expandedBytes+1,65) }])
  assert.ok(input.length < INVENTORY_FILE_LIMITS.bytes)
  await assert.rejects(readInventoryXlsx(input,'bomb.xlsx'),/expanded workbook/)
})
test('lying expanded size is detected while streaming', async () => {
  const input = archive([{ name:'xl/worksheets/sheet1.xml',data:'A'.repeat(100000),declaredSize:1 }])
  await assert.rejects(readInventoryXlsx(input,'bad.xlsx'),/damaged|cannot be read/)
})
test('excessive archive entry count rejected', async () => {
  const input = archive(Array.from({length:501},(_,index)=>({name:'part'+index,data:''})))
  await assert.rejects(readInventoryXlsx(input,'many.xlsx'),/expanded workbook/)
})
test('duplicate ZIP paths rejected', async () => {
  const input = archive([{name:'same',data:'a'},{name:'same',data:'b'}])
  await assert.rejects(readInventoryXlsx(input,'duplicate.xlsx'),/duplicate archive/)
})
test('macro and embedded file containers rejected', async () => {
  for (const name of ['xl/vbaProject.bin','xl/embeddings/object.bin']) {
    await assert.rejects(readInventoryXlsx(archive([{name,data:'x'}]),'bad.xlsx'),/macros and embedded/)
  }
})
test('ordinary ZIP cannot masquerade as XLSX', async () => {
  await assert.rejects(readInventoryXlsx(archive([{name:'note.txt',data:'hello'}]),'bad.xlsx'),/not another ZIP/)
})
