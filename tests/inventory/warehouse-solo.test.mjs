import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture } from './source-fixture.mjs'

test('solo administrator cannot count a product from another warehouse', async () => {
  const f = await fixture({ item: { warehouse_id: 'service' }, session: { restrict_to_list: false } })
  const result = await f.solo.lancarSoloContagem(f.session.id, { brand_code: f.item.brand_code, pallets: 0, cases: 1, units: 0 })
  assert.equal(result.error, 'Item not found.')
  assert.equal(f.writes.length, 0)
})
test('fixed solo counter cannot count a product from another warehouse', async () => {
  const f = await fixture({ item: { warehouse_id: 'service' }, session: { restrict_to_list: false } })
  const result = await f.solo.lancarSoloContagemCounter(f.session.id, { brand_code: f.item.brand_code, pallets: 0, cases: 1, units: 0 })
  assert.equal(result.error, 'Item not found.')
  assert.equal(f.writes.length, 0)
})
test('own warehouse remains countable without a restricted list', async () => {
  const f = await fixture({ session: { restrict_to_list: false } })
  const result = await f.solo.lancarSoloContagem(f.session.id, { brand_code: f.item.brand_code, pallets: 0, cases: 1, units: 0 })
  assert.equal(result.error, undefined)
  assert.equal(f.writes.length, 1)
})
