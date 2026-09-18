import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSource } from './source-fixture.mjs'

const { INVENTORY_HEADERS, validateInventoryImport, inventoryExportRows, warehouseKey } =
  await loadSource('lib/inventory-import.ts')
const plain = value => JSON.parse(JSON.stringify(value))
const base = {
  'Brand Code': '006323', 'Brand Name': 'Coca-Cola', Category: 'Drinks',
  Category1: 'Cans', BPU: 24, 'Pallet Size': '', 'Weight AVG': '',
  'BIN Location 1': '40B', 'BIN Location 2': '', 'BIN Location 3': '',
  'BIN Location 4': '', Status: true, WHS: 'Main',
}
const row = (changes = {}, headers = INVENTORY_HEADERS) =>
  headers.map(name => ({ ...base, ...changes })[name])
const parse = (changes = {}, choices = []) =>
  validateInventoryImport([INVENTORY_HEADERS, row(changes)], choices)
const fails = (result, column) => {
  assert.equal(result.ok, false)
  assert.equal(Object.hasOwn(result, 'items'), false, 'Invalid input must not expose a partial writable payload')
  if (column) assert.ok(result.issues.some(issue => issue.column === column), column)
}

test('the 13 approved headers are exact and in export order', () => {
  assert.deepEqual(plain(INVENTORY_HEADERS), [
    'Brand Code', 'Brand Name', 'Category', 'Category1', 'BPU',
    'Pallet Size', 'Weight AVG', 'BIN Location 1', 'BIN Location 2',
    'BIN Location 3', 'BIN Location 4', 'Status', 'WHS',
  ])
})
test('valid product preserves leading zeros; optional blanks become zero', () => {
  const result = parse()
  assert.equal(result.ok, true)
  assert.equal(result.items[0].brand_code, '006323')
  assert.equal(result.items[0].pallet_size, 0)
  assert.equal(result.items[0].weight_avg, 0)
  assert.deepEqual(plain(result.items[0].bins), ['40B'])
})
test('upload column order is arbitrary', () => {
  const headers = [...INVENTORY_HEADERS].reverse()
  assert.deepEqual(plain(validateInventoryImport([headers, row({}, headers)])), plain(parse()))
})
for (const column of INVENTORY_HEADERS) {
  test('missing column is rejected: ' + column, () => {
    const headers = INVENTORY_HEADERS.filter(name => name !== column)
    fails(validateInventoryImport([headers, row({}, headers)]), column)
  })
}
test('old Brand Purchase Unit alias is no longer accepted', () => {
  const headers = INVENTORY_HEADERS.map(name => name === 'BPU' ? 'Brand Purchase Unit' : name)
  fails(validateInventoryImport([headers, row()]), 'BPU')
})
test('duplicate and unknown headers are rejected', () => {
  fails(validateInventoryImport([[...INVENTORY_HEADERS, 'BPU'], row()]), 'BPU')
  fails(validateInventoryImport([[...INVENTORY_HEADERS, 'Unexpected'], row()]))
})
for (const column of ['Brand Code', 'Brand Name', 'Category', 'Category1', 'BPU', 'Status', 'WHS']) {
  test('required value cannot be blank: ' + column, () => fails(parse({ [column]: ' ' }), column))
}
for (const value of [0, -1, 1.5, NaN, Infinity, true, '24cases', '0x18', '2e1', '1,5', 2147483648]) {
  test('invalid BPU rejected: ' + String(value), () => fails(parse({ BPU: value }), 'BPU'))
}
test('BPU one accepts optional positive weight without requiring pallets', () => {
  const result = parse({ BPU: 1, 'Weight AVG': 330.5 })
  assert.equal(result.ok, true)
  assert.equal(result.items[0].weight_avg, 330.5)
  assert.equal(result.items[0].pallet_size, 0)
})
test('plain numeric text is supported', () => {
  const result = parse({ BPU: ' 24 ', 'Pallet Size': '80', 'Weight AVG': '330.5' })
  assert.equal(result.ok, true)
  assert.equal(result.items[0].bpu, 24)
  assert.equal(result.items[0].pallet_size, 80)
  assert.equal(result.items[0].weight_avg, 330.5)
})
for (const column of ['Pallet Size', 'Weight AVG']) {
  for (const value of [-1, NaN, Infinity, true, 'invalid', '1,234']) {
    test('invalid optional value rejected: ' + column + ' ' + String(value),
      () => fails(parse({ [column]: value }), column))
  }
}
test('fractional pallets rejected but fractional grams accepted', () => {
  fails(parse({ 'Pallet Size': 1.5 }), 'Pallet Size')
  assert.equal(parse({ 'Weight AVG': 1.5 }).ok, true)
})
for (const value of [false, 'FALSE', ' false ']) {
  test('inactive status preserved: ' + JSON.stringify(value), () => {
    const result = parse({ Status: value })
    assert.equal(result.ok, true)
    assert.equal(result.items[0].brand_active, false)
  })
}
for (const value of [0, 1, 'yes', 'Active', null]) {
  test('ambiguous status rejected: ' + JSON.stringify(value), () => fails(parse({ Status: value }), 'Status'))
}
test('WHS comparison ignores case and outer spaces, not words or inner spaces', () => {
  assert.equal(warehouseKey(' MAIN '), 'main')
  assert.notEqual(warehouseKey('Main Warehouse'), warehouseKey('Main'))
  assert.notEqual(warehouseKey('Main  Warehouse'), warehouseKey('Main Warehouse'))
  const result = validateInventoryImport([INVENTORY_HEADERS, row(), row({ 'Brand Code': '2', WHS: ' MAIN ' })])
  assert.equal(result.ok, true)
  assert.equal(result.warehouseKey, 'main')
})
test('new warehouse names are parsed without hardcoded Main/Service choices', () => {
  const result = parse({ WHS: ' Fourth Warehouse ' })
  assert.equal(result.ok, true)
  assert.equal(result.warehouseName, 'Fourth Warehouse')
  // This pure module does not create or authorize a warehouse.
})
test('mixed warehouses fail even when conflicting duplicate row is discarded', () => {
  fails(validateInventoryImport([INVENTORY_HEADERS, row(), row({ WHS: 'Service' })],
    [{ brandCode: '006323', row: 2 }]), 'WHS')
})
test('empty files cannot be interpreted as deactivate everything', () => {
  fails(validateInventoryImport([]))
  fails(validateInventoryImport([INVENTORY_HEADERS]))
  fails(validateInventoryImport([INVENTORY_HEADERS, [], row(Object.fromEntries(INVENTORY_HEADERS.map(h => [h, ''])))]))
})
test('blank physical rows are ignored but source row numbers are retained', () => {
  const result = validateInventoryImport([INVENTORY_HEADERS, [], row()])
  assert.equal(result.ok, true)
  assert.equal(result.items[0].sourceRow, 3)
})
test('data outside headers is not silently ignored', () => {
  fails(validateInventoryImport([INVENTORY_HEADERS, [...row(), 'hidden product data']]))
})
test('all duplicate occurrences are exposed; none chosen automatically', () => {
  const result = validateInventoryImport([INVENTORY_HEADERS, row(), row(), row(), row({ 'Brand Code': 'other' })])
  fails(result)
  assert.equal(result.duplicates.length, 1)
  assert.deepEqual(plain(result.duplicates[0].candidates.map(candidate => candidate.row)), [2, 3, 4])
})
test('each duplicate group requires an explicit choice', () => {
  const result = validateInventoryImport([INVENTORY_HEADERS, row(), row(),
    row({ 'Brand Code': 'other' }), row({ 'Brand Code': 'other' })],
    [{ brandCode: '006323', row: 2 }])
  fails(result)
  assert.deepEqual(plain(result.duplicates.map(group => group.brandCode)), ['other'])
})
test('duplicate resolution keeps exactly the chosen row', () => {
  const result = validateInventoryImport([INVENTORY_HEADERS, row(), row({ 'Brand Name': 'Chosen', Status: false })],
    [{ brandCode: '006323', row: 3 }])
  assert.equal(result.ok, true)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].brand_name, 'Chosen')
  assert.equal(result.items[0].brand_active, false)
})
test('discarded duplicate field errors do not invalidate the chosen valid product', () => {
  const result = validateInventoryImport([INVENTORY_HEADERS, row({ BPU: 0 }), row()],
    [{ brandCode: '006323', row: 3 }])
  assert.equal(result.ok, true)
})
test('choosing a duplicate does not bypass required-field validation', () => {
  const result = validateInventoryImport([INVENTORY_HEADERS, row(), row({ BPU: 0 })],
    [{ brandCode: '006323', row: 3 }])
  fails(result, 'BPU')
})
for (const choices of [
  [{ brandCode: '006323', row: 999 }],
  [{ brandCode: 'missing', row: 2 }],
  [{ brandCode: '006323', row: 2 }, { brandCode: '006323', row: 3 }],
]) {
  test('stale/forged/duplicate choices rejected: ' + JSON.stringify(choices),
    () => fails(validateInventoryImport([INVENTORY_HEADERS, row(), row()], choices), 'Brand Code'))
}
test('a selection for a now-unique code is stale', () => {
  fails(parse({}, [{ brandCode: '006323', row: 2 }]), 'Brand Code')
})
test('Brand Code remains textual: 006323 differs from 6323', () => {
  const result = validateInventoryImport([INVENTORY_HEADERS, row(), row({ 'Brand Code': 6323 })])
  assert.equal(result.ok, true)
  assert.equal(result.items.length, 2)
})
test('numeric and textual copies of the same code are duplicates', () => {
  const result = validateInventoryImport([INVENTORY_HEADERS,
    row({ 'Brand Code': 6323 }), row({ 'Brand Code': '6323' })])
  fails(result)
  assert.equal(result.duplicates[0].brandCode, '6323')
})
test('unsafe numeric identifiers, booleans and objects are rejected', () => {
  for (const value of [Number.MAX_SAFE_INTEGER + 1, 1.5, true, {}]) {
    fails(parse({ 'Brand Code': value }), 'Brand Code')
  }
})
test('prototype-like product codes do not break duplicate detection', () => {
  const result = validateInventoryImport([INVENTORY_HEADERS,
    row({ 'Brand Code': '__proto__' }), row({ 'Brand Code': '__proto__' })])
  fails(result)
  assert.equal(result.duplicates[0].brandCode, '__proto__')
})
test('BINs are optional, trimmed and deduplicated without changing case', () => {
  const result = parse({ 'BIN Location 1': ' 40B ', 'BIN Location 2': '40B', 'BIN Location 3': '40b', 'BIN Location 4': 42 })
  assert.equal(result.ok, true)
  assert.deepEqual(plain(result.items[0].bins), ['40B', '40b', '42'])
  assert.equal(parse({ 'BIN Location 1': '', Status: false }).ok, true)
})
test('one bad row rejects the whole payload without mutating input', () => {
  const matrix = [INVENTORY_HEADERS, row(), row({ 'Brand Code': 'other', BPU: 0 })]
  const original = JSON.stringify(matrix)
  fails(validateInventoryImport(matrix), 'BPU')
  assert.equal(JSON.stringify(matrix), original)
})
test('export/reimport matrix preserves inactive status, text codes, optional zero and WHS', () => {
  const input = validateInventoryImport([INVENTORY_HEADERS, row(),
    row({ 'Brand Code': '00002', Status: false, 'Weight AVG': 330.5, 'BIN Location 1': '' })])
  assert.equal(input.ok, true)
  const exported = inventoryExportRows(input.warehouseName, input.items)
  assert.equal(exported[2][0], '00002')
  assert.equal(exported[2][11], false)
  assert.deepEqual(plain(validateInventoryImport(exported)), plain(input))
})
