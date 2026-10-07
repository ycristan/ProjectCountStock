import test from 'node:test'
import assert from 'node:assert/strict'
import { teamSessionSheets } from '../../lib/team-session-report.ts'

// Synthetic data only. Columns approved by Yuri on 2026-10-07.
const teams = [{
  teamId: 'a', name: 'Aisle A', recounted: ['p2'],
  participants: [
    { membership_id: 'ind', name: 'Ivy', role: 'independent', order: 0 },
    { membership_id: 'c2', name: 'Ben', role: 'counter', order: 2 },
    { membership_id: 'c1', name: 'Anna', role: 'counter', order: 1 },
  ],
  items: [
    { brand_code: 'p2', brand_name: 'Two', category: 'Snacks', category1: null, bpu: 10, quantity_units: 15, resolution: 'reconciled',
      source_counts: [{ membership_id: 'c1', quantity_units: 14 }, { membership_id: 'c2', quantity_units: 17 }] },
    { brand_code: 'p1', brand_name: 'One', category: 'Drinks', category1: 'Cans', bpu: 24, quantity_units: 50, resolution: 'equal',
      source_counts: [{ membership_id: 'c1', quantity_units: 50 }, { membership_id: 'c2', quantity_units: 50 }] },
  ],
}, { teamId: 'b', name: 'Aisle A', recounted: [], participants: [], items: [] }]
const consolidated = [
  { brand_code: 'p9', brand_name: 'Missing', category: null, category1: null, bpu: 6, brand_active: true,
    final_cases: 0, final_units: 0, uncounted: true, team_quantities: [] },
  { brand_code: 'p1', brand_name: 'One', category: 'Drinks', category1: 'Cans', bpu: 24, brand_active: false,
    final_cases: 3, final_units: 2, uncounted: false, team_quantities: [{ teamId: 'a', quantity: 50 }, { teamId: 'b', quantity: 24 }] },
]
const sheets = teamSessionSheets(teams, consolidated)
const sheet = name => sheets.find(s => s.name === name)

test('one sheet per team, then Consolidado and the unchanged template', () => {
  assert.deepEqual(sheets.map(s => s.name), ['Aisle A', 'Aisle A 2', 'Consolidado', 'Template Import Reconc'])
})

test('team sheet: each counter in order, reconciled only when reconciled, how it was resolved', () => {
  const [header, p1, p2] = sheet('Aisle A').rows
  assert.deepEqual(header, ['Category', 'Category 1', 'Brand Code', 'Brand Name', 'BPU',
    'Counter 1 — Anna Cases', 'Counter 1 — Anna Units', 'Counter 2 — Ben Cases', 'Counter 2 — Ben Units',
    'Reconciled Cases', 'Reconciled Units', 'Final Cases', 'Final Units', 'Resolution'])
  assert.deepEqual(p1, ['Drinks', 'Cans', 'p1', 'One', 24, 2, 2, 2, 2, '', '', 2, 2, 'Equal'])
  assert.deepEqual(p2, ['Snacks', '', 'p2', 'Two', 10, 1, 4, 1, 7, 1, 5, 1, 5, 'Recounted'])
})

test('consolidado: final of each team, total, status and "Not counted"', () => {
  const [header, p1, p9] = sheet('Consolidado').rows
  assert.deepEqual(header, ['Category', 'Category 1', 'Brand Code', 'Brand Name', 'BPU', 'Status',
    'Aisle A Cases', 'Aisle A Units', 'Aisle A Cases', 'Aisle A Units', 'TOTAL Cases', 'TOTAL Units', 'Note'])
  assert.deepEqual(p1, ['Drinks', 'Cans', 'p1', 'One', 24, 'Inactive', 2, 2, 1, 0, 3, 2, ''])
  assert.deepEqual(p9, ['', '', 'p9', 'Missing', 6, 'Active', '', '', '', '', 0, 0, 'Not counted'])
})

test('template keeps the legacy four columns and Avl, uncounted with 0', () => {
  assert.deepEqual(sheet('Template Import Reconc').rows, [
    ['Brand Code', 'Outer (qty)', 'Units (qty)', 'Status'], ['p1', 3, 2, 'Avl'], ['p9', 0, 0, 'Avl']])
})

test('audit count keeps replaced versions, raw weighing and every decision in time order', async () => {
  const { teamAuditSheets } = await import('../../lib/team-audit-report.ts')
  const sheets = teamAuditSheets(
    [{ team: 'A', person: 'Anna', brand_code: 'p1', revision: 1, pallets: 0, cases: 0, units: 11, quantity_units: 11, method: 'weight',
        weighing: { grossG: 1370, boxes: 1, tareG: 300, netG: 1070, rounds: [{}, {}] }, recorded_at: '2026-10-07T10:05:00Z', replaced_at: null },
     { team: 'A', person: 'Anna', brand_code: 'p1', revision: 0, pallets: 0, cases: 0, units: 10, quantity_units: 10, method: 'manual',
        weighing: null, recorded_at: '2026-10-07T10:00:00Z', replaced_at: '2026-10-07T10:05:00Z' }],
    [{ team: 'A', person: 'Ivy', brand_code: 'p1', round: 1, pallets: 0, cases: 0, units: 12, quantity_units: 12, method: 'manual',
        weighing: null, recorded_at: '2026-10-07T11:00:00Z' }],
    [{ team: 'A', at: '2026-10-07T12:00:00Z', person: 'Ben', action: 'Signed by PIN', detail: '' },
     { team: 'A', at: '2026-10-07T11:30:00Z', person: 'Admin', action: 'Returned for recount', detail: 'p1' }])
  assert.deepEqual(sheets.map(s => s.name), ['Counts', 'Reconciliations', 'Decisions and signatures'])
  assert.deepEqual(sheets[0].rows[1], ['A', 'Anna', 'p1', 1, 0, 0, 10, 10, 'manual', '', '', '', '', '',
    '2026-10-07T10:00:00Z', '2026-10-07T10:05:00Z'])
  assert.deepEqual(sheets[0].rows[2].slice(8, 14), ['weight', 1370, 1, 300, 1070, 2])
  assert.deepEqual(sheets[1].rows[1].slice(0, 4), ['A', 'Ivy', 'p1', 1])
  assert.deepEqual(sheets[2].rows.slice(1).map(r => r[3]), ['Returned for recount', 'Signed by PIN'])
})
