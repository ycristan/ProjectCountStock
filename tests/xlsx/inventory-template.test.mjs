import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Buffer } from 'node:buffer'
import * as XLSX from 'xlsx'
import * as yauzl from 'yauzl'
import { loadSource } from '../inventory/source-fixture.mjs'

const format = await loadSource('lib/inventory-import.ts')
const { createInventoryTemplate, INVENTORY_TEMPLATE_FILENAME } = await loadSource('lib/inventory-template.ts', {
  xlsx: XLSX, './inventory-import': format,
})
const { readInventoryXlsx } = await loadSource('lib/inventory-xlsx.ts', {
  'server-only': {}, 'node:buffer': { Buffer }, xlsx: XLSX, yauzl, './inventory-import': format,
})
const bytes = wb => XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })
const reopen = wb => XLSX.read(bytes(wb), { type: 'buffer', cellNF: true })
const plain = value => JSON.parse(JSON.stringify(value))

test('template exports one worksheet and exactly the approved headers in order', () => {
  const wb = reopen(createInventoryTemplate())
  assert.deepEqual(wb.SheetNames, ['Inventory'])
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Inventory, { header: 1, blankrows: false })
  assert.deepEqual(rows[0], [...format.INVENTORY_HEADERS])
  // SheetJS retains explicitly formatted empty strings as the blank input row.
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[1], Array(13).fill(''))
  assert.equal(INVENTORY_TEMPLATE_FILENAME, 'inventory-template.xlsx')
})
test('blank template has no products, formulas or extra instructions', async () => {
  const wb = createInventoryTemplate()
  for (const [address, cell] of Object.entries(wb.Sheets.Inventory)) {
    if (address.startsWith('!')) continue
    assert.equal(cell.f, undefined)
    assert.equal(cell.F, undefined)
    if (!address.endsWith('1')) assert.equal(cell.v, '')
  }
  const result = await readInventoryXlsx(bytes(wb), INVENTORY_TEMPLATE_FILENAME)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some(issue => issue.message.includes('At least one product')))
})
test('first input row preserves text formatting after XLSX export', () => {
  const sheet = reopen(createInventoryTemplate()).Sheets.Inventory
  for (const column of ['A','B','C','D','H','I','J','K','L','M']) assert.equal(sheet[column+'2'].z, '@')
  assert.equal(sheet.E2.z, '0')
  assert.equal(sheet.F2.z, '0')
  assert.equal(sheet.G2.z, '0.########')
})
test('filled downloaded template passes the actual importer with optional blanks', async () => {
  const wb = reopen(createInventoryTemplate())
  XLSX.utils.sheet_add_aoa(wb.Sheets.Inventory, [
    ['006323','Coca-Cola','Drinks','Cans',1,'','','40B','','','',false,'Main'],
  ], { origin: 'A2' })
  const result = await readInventoryXlsx(bytes(wb), INVENTORY_TEMPLATE_FILENAME)
  assert.equal(result.ok, true)
  assert.equal(result.warehouseName, 'Main')
  assert.equal(result.items[0].brand_code, '006323')
  assert.equal(result.items[0].brand_active, false)
  assert.equal(result.items[0].bpu, 1)
  assert.equal(result.items[0].pallet_size, 0)
  assert.equal(result.items[0].weight_avg, 0)
  assert.deepEqual(plain(result.items[0].bins), ['40B'])
})
test('each download starts from a fresh workbook', () => {
  const first = createInventoryTemplate()
  first.Sheets.Inventory.A1.v = 'changed'
  assert.equal(createInventoryTemplate().Sheets.Inventory.A1.v, 'Brand Code')
})
test('download uses the tested generator and XLSX filename', async () => {
  let captured
  const module = await loadSource('lib/inventory-template.ts', {
    xlsx: { ...XLSX, writeFile: (wb, filename, options) => { captured = { wb, filename, options } } },
    './inventory-import': format,
  })
  module.downloadInventoryTemplate()
  assert.equal(captured.filename, INVENTORY_TEMPLATE_FILENAME)
  assert.equal(captured.options.bookType, 'xlsx')
  assert.deepEqual(reopen(captured.wb).SheetNames, ['Inventory'])
})
