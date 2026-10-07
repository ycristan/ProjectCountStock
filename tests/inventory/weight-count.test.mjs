import test from 'node:test'
import assert from 'node:assert/strict'
import { weightUnits } from '../../lib/weight-count.ts'

test('exact .7 rounds up despite floating-point error (1070 g / 100 g = 11)', () => {
  assert.equal(1070 / 100 - Math.floor(1070 / 100) < 0.7, true, 'premise: raw fraction is 0.6999…')
  assert.equal(weightUnits(1070 / 100), 11)
  assert.equal(weightUnits(870 / 100), 9)
  assert.equal(weightUnits(2070 / 100), 21)
})

test('fraction of 0.7 or more rounds up, below 0.7 rounds down', () => {
  assert.equal(weightUnits(10.75), 11)
  assert.equal(weightUnits(10.69), 10)
  assert.equal(weightUnits(10.699999), 10)
  assert.equal(weightUnits(10), 10)
  assert.equal(weightUnits(0.7), 1)
  assert.equal(weightUnits(0.5), 0)
})

test('no weight or negative net weight gives zero', () => {
  assert.equal(weightUnits(0), 0)
  assert.equal(weightUnits(-3.8), 0)
  assert.equal(weightUnits(NaN), 0)
})
