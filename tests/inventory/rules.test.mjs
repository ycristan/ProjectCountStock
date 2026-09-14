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

test('administrator can save in an open session', async () => {
  const f = await fixture()
  assert.equal((await f.solo.lancarSoloContagem(f.session.id, payload)).error, undefined)
  assert.equal(f.writes.length, 1)
})
test('administrator cannot bypass restricted product list', async () => {
  const f = await fixture({ allowed: false })
  blocked(await f.solo.lancarSoloContagem(f.session.id, payload), f.writes)
})
test('administrator cannot write to a missing session', async () => {
  const f = await fixture({ missingSession: true })
  blocked(await f.solo.lancarSoloContagem(f.session.id, payload), f.writes)
})
test('session lookup failure prevents writes', async () => {
  const f = await fixture({ readErrorTable: 'solo_sessions' })
  blocked(await f.solo.lancarSoloContagem(f.session.id, payload), f.writes)
})
test('list can be prepared before the count starts', async () => {
  const f = await fixture({ started: false, session: { counter_name: null } })
  assert.equal((await f.solo.adicionarItemListaSolo(f.session.id, 'new')).error, undefined)
  assert.equal(f.writes.length, 1)
})
test('existing entry freezes list even without a counter name', async () => {
  const f = await fixture({ session: { counter_name: null } })
  blocked(await f.solo.adicionarItemListaSolo(f.session.id, 'new'), f.writes)
})
test('closed list rejects additions even without entries', async () => {
  const f = await fixture({ started: false, session: { status: 'closed', counter_name: null } })
  blocked(await f.solo.adicionarItemListaSolo(f.session.id, 'new'), f.writes)
})
test('entry lookup failure does not unlock the list', async () => {
  const f = await fixture({ readErrorTable: 'solo_entries', session: { counter_name: null } })
  blocked(await f.solo.adicionarItemListaSolo(f.session.id, 'new'), f.writes)
})
test('list restriction cannot be disabled after start', async () => {
  const f = await fixture()
  blocked(await f.solo.atribuirSoloContador(f.session.id, true, false), f.writes)
})
const fields = bpu => ({ brand_name: 'Test', bpu, pallet_size: 0, weight_avg: 0, category: 'Test', category1: 'Test', bins: [] })
test('unchanged BPU allows editing other fields during solo', async () => {
  const f = await fixture()
  assert.equal((await f.inventory.editarItemInventario('6323', fields(20))).error, undefined)
  assert.ok(f.writes.length > 0)
})
test('BPU can change when no solo session is open', async () => {
  const f = await fixture({ session: { status: 'closed' } })
  assert.equal((await f.inventory.editarItemInventario('6323', fields(24))).error, undefined)
  assert.equal(f.writes[0].payload.bpu, 24)
})
test('BPU cannot change if active-session lookup fails', async () => {
  const f = await fixture({ readErrorTable: 'solo_sessions' })
  blocked(await f.inventory.editarItemInventario('6323', fields(24)), f.writes)
})
test('inventory rejects zero BPU before any mutation', async () => {
  const f = await fixture()
  blocked(await f.inventory.editarItemInventario('6323', fields(0)), f.writes)
})
