import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSource } from './source-fixture.mjs'

const f = await loadSource('lib/inventory-filters.ts')
const mk = (code, o = {}) => ({ brand_code: code, brand_name: 'N' + code, bpu: 1, pallet_size: 0, weight_avg: 0,
  category: 'Food', category1: '', brand_active: true, bins: [], ...o })
const items = [
  mk('A', { bpu: 10, brand_active: false, bins: ['T05'], category: 'Drink' }),
  mk('B', { bpu: 2, bins: ['T05', 'T06'] }),
  mk('C', { bpu: 24, category1: 'Snack', bins: ['', 'X1'] }),
  mk('D', { bpu: 0, brand_active: false, weight_avg: 1.5 }),
]
const state = (selected = {}, sort = null) => ({ selected: Object.fromEntries(Object.entries(selected).map(([k, v]) => [k, new Set(v)])), sort })
const codes = (rows) => rows.map((r) => r.brand_code).join('')

test('blank handling: empty text, zero numbers and missing bins show (Blank)', () => {
  assert.equal(f.cellValue(items[0], 'category1'), '(Blank)')
  assert.equal(f.cellValue(items[3], 'bpu'), '(Blank)')
  assert.equal(f.cellValue(items[3], 'weight_avg'), '1.5')
  assert.equal(f.cellValue(items[0], 'bin2'), '(Blank)')
  assert.equal(f.cellValue(items[2], 'bin1'), '(Blank)')
})
test('BIN columns use the bin at their index', () => {
  assert.equal(f.cellValue(items[1], 'bin1'), 'T05')
  assert.equal(f.cellValue(items[1], 'bin2'), 'T06')
  assert.equal(codes(f.applyFilters(items, state({ bin2: ['X1'] }))), 'C')
  assert.equal(codes(f.applyFilters(items, state({ bin1: ['T05'] }))), 'AB')
})
test('Status shows Active / Inactive', () => {
  assert.deepEqual([...f.distinctValues(items, state(), 'status')], ['Active', 'Inactive'])
  assert.equal(codes(f.applyFilters(items, state({ status: ['Inactive'] }))), 'AD')
})
test('filters on several columns combine with AND', () => {
  assert.equal(codes(f.applyFilters(items, state({ status: ['Inactive'], category: ['Drink'] }))), 'A')
  assert.equal(codes(f.applyFilters(items, state({ status: ['Inactive'], bin1: ['T05'], category: ['Food'] }))), '')
})
test('distinct values ignore the column own filter but respect the others', () => {
  const s = state({ status: ['Inactive'], bpu: ['10'] })
  assert.deepEqual([...f.distinctValues(items, s, 'bpu')], ['(Blank)', '10'])
  assert.deepEqual([...f.distinctValues(items, s, 'category')], ['Drink'])
})
test('numeric columns sort numerically, blank first; text sorts alphabetically', () => {
  assert.equal(codes(f.applyFilters(items, state({}, { key: 'bpu', dir: 'asc' }))), 'DBAC')
  assert.equal(codes(f.applyFilters(items, state({}, { key: 'bpu', dir: 'desc' }))), 'CABD')
  assert.deepEqual([...f.distinctValues(items, state(), 'bpu')], ['(Blank)', '2', '10', '24'])
  assert.equal(codes(f.applyFilters(items, state({}, { key: 'category', dir: 'desc' }))), 'BCDA')
  assert.deepEqual([...f.distinctValues(items, state(), 'category')], ['Drink', 'Food'])
})
test('select a subset then clear it: no filter returns every row', () => {
  assert.equal(codes(f.applyFilters(items, state({ bpu: ['2', '24'] }))), 'BC')
  const cleared = state()
  assert.deepEqual([...f.activeFilterKeys(cleared)], [])
  assert.equal(f.applyFilters(items, cleared), items)
})

test('codes sort in natural order: 3 and 5 before 1111, leading zeros by value', () => {
  const rows = ['1111', '5', '0017', '3', '100', 'AB2', 'AB10'].map((c) => mk(c))
  assert.equal(f.applyFilters(rows, state({}, { key: 'brand_code', dir: 'asc' })).map((r) => r.brand_code).join(' '), '3 5 0017 100 1111 AB2 AB10')
  assert.equal(f.applyFilters(rows, state({}, { key: 'brand_code', dir: 'desc' }))[0].brand_code, 'AB10')
  assert.deepEqual([...f.distinctValues(rows, state(), 'brand_code')].slice(0, 3), ['3', '5', '0017'])
})
test('filter search puts the exact value first, then starts-with, then contains', () => {
  const values = ['0031', '0130', '1038', '3', '30', '300', '113']
  assert.deepEqual([...f.searchValues(values, '3')], ['3', '30', '300', '0031', '0130', '1038', '113'])
  assert.deepEqual([...f.searchValues(values, '')], values)
})

test('Brand Code list: comma, semicolon or line separated exact codes; missing ones reported', () => {
  assert.equal(f.codeList('6323'), null)
  assert.deepEqual([...f.codeList(' 6323, 6324;6400\n6401,,6323 ')], ['6323', '6324', '6400', '6401'])
  const r = f.pickCodes(['6323', '16323', '63230', '6324', '0017'], ['6323', '6324', '6400', '17'])
  assert.deepEqual([...r.found], ['6323', '6324'])
  assert.deepEqual([...r.missing], ['6400', '17'])
})
