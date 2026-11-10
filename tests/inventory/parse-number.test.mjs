import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSource } from './source-fixture.mjs'

const { parseInventoryNumber, parseInventoryNumbers } = await loadSource('lib/parse-number.ts')

test('comma and point are both decimal separators (browser turned "2,5" into 25)', () => {
  assert.equal(parseInventoryNumber('2,5', false), 2.5)
  assert.equal(parseInventoryNumber('2.5', false), 2.5)
  assert.equal(parseInventoryNumber(' 6,25 ', false), 6.25)
  assert.equal(parseInventoryNumber('15000', false), 15000)
})
test('thousands separators and junk are refused, never guessed', () => {
  for (const t of ['1.250', '1,250', '2.555', '1.000,5', '2,5g', '-1', 'abc', '2.', ',5']) assert.equal(parseInventoryNumber(t, false), null, t)
})
test('BPU and Pallet Size take whole numbers only; empty is 0', () => {
  assert.equal(parseInventoryNumber('24', true), 24)
  assert.equal(parseInventoryNumber('', true), 0)
  assert.equal(parseInventoryNumber('2,5', true), null)
  assert.equal(parseInventoryNumber('2.0', true), null)
})
test('form reader names the bad field', () => {
  assert.deepEqual({ ...parseInventoryNumbers({ bpu: '12', pallet_size: '', weight_avg: '2,5' }) }, { bpu: 12, pallet_size: 0, weight_avg: 2.5 })
  assert.match(parseInventoryNumbers({ bpu: '1,5', pallet_size: '', weight_avg: '' }).error, /BPU/)
  assert.match(parseInventoryNumbers({ bpu: '1', pallet_size: '', weight_avg: '1.250' }).error, /Weight AVG/)
})
