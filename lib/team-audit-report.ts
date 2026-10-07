// Audit Count workbook (block 12): everything each person entered in a team
// session, including replaced count versions and raw weighing. Pure: rows only.
import type { Sheet } from './team-session-report'

type Weighing = { grossG?: number; boxes?: number; tareG?: number; netG?: number; rounds?: unknown[] } | null
export type AuditCount = {
  team: string; person: string; brand_code: string; revision: number; pallets: number; cases: number; units: number
  quantity_units: number; method: string; weighing: Weighing; recorded_at: string; replaced_at: string | null
}
export type AuditReconciliation = {
  team: string; person: string; brand_code: string; round: number | null; pallets: number; cases: number; units: number
  quantity_units: number; method: string; weighing: Weighing; recorded_at: string
}
export type AuditEvent = { team: string; at: string; person: string; action: string; detail: string }

const weighingColumns = (w: Weighing) => w
  ? [w.grossG ?? '', w.boxes ?? '', w.tareG ?? '', w.netG ?? '', Array.isArray(w.rounds) ? w.rounds.length : '']
  : ['', '', '', '', '']
const WEIGHING = ['Gross g', 'Boxes', 'Tare g', 'Net g', 'Weighing rounds']

export function teamAuditSheets(counts: AuditCount[], reconciliations: AuditReconciliation[], events: AuditEvent[]): Sheet[] {
  const order = <T extends { team: string; recorded_at?: string; at?: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.team.localeCompare(b.team) || String(a.recorded_at ?? a.at).localeCompare(String(b.recorded_at ?? b.at)))
  return [
    { name: 'Counts', rows: [
      ['Team', 'Person', 'Brand Code', 'Version', 'Pallets', 'Cases', 'Units', 'Quantity (units)', 'Method', ...WEIGHING,
        'Recorded at', 'Replaced at'],
      ...order(counts).map(c => [c.team, c.person, c.brand_code, c.revision + 1, c.pallets, c.cases, c.units, c.quantity_units,
        c.method, ...weighingColumns(c.weighing), c.recorded_at, c.replaced_at ?? '']),
    ] },
    { name: 'Reconciliations', rows: [
      ['Team', 'Independent', 'Brand Code', 'Recount round', 'Pallets', 'Cases', 'Units', 'Quantity (units)', 'Method', ...WEIGHING,
        'Recorded at'],
      ...order(reconciliations).map(r => [r.team, r.person, r.brand_code, r.round ?? '', r.pallets, r.cases, r.units,
        r.quantity_units, r.method, ...weighingColumns(r.weighing), r.recorded_at]),
    ] },
    { name: 'Decisions and signatures', rows: [
      ['Team', 'When', 'Person', 'Action', 'Detail'],
      ...order(events).map(e => [e.team, e.at, e.person, e.action, e.detail]),
    ] },
  ]
}
