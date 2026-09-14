import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, loadSource } from './source-fixture.mjs'

const payload = { brand_code: '6323', pallets: 0, cases: 20, units: 0 }
function blocked(result, writes) {
  assert.equal(writes.length, 0, 'A forbidden operation reached the database write boundary')
  assert.ok(result.error, 'The caller must receive an explanation')
}

test('counter cannot write to a closed solo session', async () => {
  const f = await fixture({ session: { status: 'closed' } })
  blocked(await f.solo.lancarSoloContagemCounter(f.session.id, payload), f.writes)
})
test('counter cannot count an item outside the restricted list', async () => {
  const f = await fixture({ allowed: false })
  blocked(await f.solo.lancarSoloContagemCounter(f.session.id, payload), f.writes)
})
test('unauthorized administrator cannot add to the list', async () => {
  const f = await fixture({ admin: false })
  blocked(await f.solo.adicionarItemListaSolo(f.session.id, 'new-product'), f.writes)
})
test('authorized counter can save an allowed item in an open session', async () => {
  const f = await fixture()
  const result = await f.solo.lancarSoloContagemCounter(f.session.id, payload)
  assert.equal(result.error, undefined)
  assert.equal(f.writes.length, 1)
  assert.equal(f.writes[0].table, 'solo_entries')
  assert.equal(f.writes[0].payload.cases, 20)
  assert.equal(f.writes[0].payload.final_cases, 20)
})
test('BPU zero prevents saving a count', async () => {
  const f = await fixture({ item: { bpu: 0 } })
  blocked(await f.solo.lancarSoloContagemCounter(f.session.id, payload), f.writes)
})
test('missing pallet size does not prevent Cases counting', async () => {
  const f = await fixture({ item: { pallet_size: 0 } })
  assert.equal((await f.solo.lancarSoloContagemCounter(f.session.id, payload)).error, undefined)
  assert.equal(f.writes.length, 1)
})
test('negative physical quantities are rejected without writing', async () => {
  const f = await fixture()
  blocked(await f.solo.lancarSoloContagemCounter(f.session.id, { ...payload, cases: -1 }), f.writes)
})
test('conversion example: the same 20 Cases represent 400 then 480 Units', async () => {
  const { convertCount } = await loadSource('lib/convert.ts')
  const before = convertCount(0, 20, 0, 20, 0)
  const after = convertCount(0, 20, 0, 24, 0)
  assert.equal(before.finalCases * 20 + before.finalUnits, 400)
  assert.equal(after.finalCases * 24 + after.finalUnits, 480)
})
// These are ordinary assertions, not skip/todo or expected-failure markers.
// A red result records an unimplemented server-action contract; do not weaken it.
test('CONTRACT: administrator cannot write to a closed solo session', async () => {
  const f = await fixture({ session: { status: 'closed' } })
  blocked(await f.solo.lancarSoloContagem(f.session.id, payload), f.writes)
})
test('CONTRACT: no product can be added after a restricted count has started', async () => {
  // Existing entry is evidence counting has started, without inventing a new status.
  const f = await fixture()
  blocked(await f.solo.adicionarItemListaSolo(f.session.id, 'new-product'), f.writes)
})
test('CONTRACT: active solo count blocks direct BPU edits', async () => {
  const f = await fixture()
  const result = await f.inventory.editarItemInventario('6323', {
    brand_name: f.item.brand_name, bpu: 24, pallet_size: 0, weight_avg: 0,
    category: 'Test', category1: 'Test', bins: [],
  })
  blocked(result, f.writes)
})
