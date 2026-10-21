import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import type { ConsolidatedItem, TeamReport } from '@/lib/team-session-report'
import type { AuditCount, AuditEvent, AuditReconciliation } from '@/lib/team-audit-report'

// Reads run with the caller's session (admin RLS). The caller must already be a
// checked admin; the service role only resolves admin e-mails for attribution.
type Db = SupabaseClient
// Every paged read orders by the table's unique key, so pages never repeat or skip rows.
const KEYS: Record<string, string[]> = {
  team_session_result_items: ['brand_code'], team_result_versions: ['id'], team_result_items: ['version_id', 'brand_code'],
  team_recount_items: ['review_id', 'brand_code'], teams: ['id'], team_memberships: ['id'], team_slot_assignments: ['id'],
  team_count_records: ['id'], team_count_record_history: ['record_id', 'revision'], team_reconciliations: ['id'],
  team_item_decisions: ['id'], team_finish_events: ['id'], team_departures: ['id'], team_admin_reviews: ['id'],
  team_confirmations: ['id'],
}
async function all<T>(db: Db, table: string, columns: string, key: string, values: string[]): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < values.length; i += 200) {
    const part = values.slice(i, i + 200)
    out.push(...await fetchAllRows<T>((from, to) => {
      let q = db.from(table).select(columns).in(key, part)
      for (const k of KEYS[table]) q = q.order(k)
      return q.range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>
    }))
  }
  return out
}

export async function loadTeamSessionReport(db: Db, sessionId: string) {
  const { data: result } = await db.from('team_session_results').select('teams,warehouse_name,acknowledged_at')
    .eq('session_id', sessionId).maybeSingle()
  if (!result) return null
  const order = result.teams as { teamId: string; name: string; versionId: string }[]
  const consolidated = await all<ConsolidatedItem>(db, 'team_session_result_items',
    'brand_code,brand_name,category,category1,bpu,brand_active,final_cases,final_units,uncounted,team_quantities',
    'session_id', [sessionId])
  const versionIds = order.map(t => t.versionId)
  const [versions, items, recounts] = await Promise.all([
    all<{ id: string; participants: TeamReport['participants'] }>(db, 'team_result_versions', 'id,participants', 'id', versionIds),
    all<TeamReport['items'][number] & { version_id: string }>(db, 'team_result_items',
      'version_id,brand_code,brand_name,category,category1,bpu,quantity_units,resolution,source_counts', 'version_id', versionIds),
    all<{ team_id: string; brand_code: string }>(db, 'team_recount_items', 'team_id,brand_code', 'team_id', order.map(t => t.teamId)),
  ])
  const teams: TeamReport[] = order.map(t => ({
    teamId: t.teamId, name: t.name,
    participants: versions.find(v => v.id === t.versionId)?.participants ?? [],
    items: items.filter(i => i.version_id === t.versionId),
    recounted: [...new Set(recounts.filter(r => r.team_id === t.teamId).map(r => r.brand_code))],
  }))
  return { warehouseName: result.warehouse_name as string, acknowledgedAt: result.acknowledged_at as string, teams, consolidated }
}

type Member = { id: string; team_id: string; user_id: string; display_name: string }

export async function loadTeamAudit(db: Db, sessionId: string) {
  const teams = await all<{ id: string; team_name: string }>(db, 'teams', 'id,team_name', 'session_id', [sessionId])
  const teamIds = teams.map(t => t.id)
  if (!teamIds.length) return null
  const teamName = new Map(teams.map(t => [t.id, t.team_name]))
  const [members, assignments, records, reconciliations, decisions, finishes, departures, reviews, recountItems, confirmations] =
    await Promise.all([
      all<Member>(db, 'team_memberships', 'id,team_id,user_id,display_name', 'team_id', teamIds),
      all<{ id: string; membership_id: string }>(db, 'team_slot_assignments', 'id,membership_id', 'team_id', teamIds),
      all<{ id: string; team_id: string; assignment_id: string; brand_code: string; revision: number; pallets: number; cases: number
        units: number; quantity_units: number; method: string; weighing: AuditCount['weighing']; recorded_at: string }>(db,
        'team_count_records', 'id,team_id,assignment_id,brand_code,revision,pallets,cases,units,quantity_units,method,weighing,recorded_at',
        'team_id', teamIds),
      all<{ team_id: string; reconciled_by: string; brand_code: string; recount_review_id: string | null; pallets: number
        cases: number; units: number; quantity_units: number; method: string; weighing: AuditCount['weighing']; recorded_at: string }>(db,
        'team_reconciliations', 'team_id,reconciled_by,brand_code,recount_review_id,pallets,cases,units,quantity_units,method,weighing,recorded_at',
        'team_id', teamIds),
      all<{ team_id: string; decided_by: string; brand_code: string; decision: string; quantity_units: number | null; decided_at: string }>(db,
        'team_item_decisions', 'team_id,decided_by,brand_code,decision,quantity_units,decided_at', 'team_id', teamIds),
      all<{ team_id: string; actor_membership_id: string; subject_membership_id: string; action: string; occurred_at: string }>(db,
        'team_finish_events', 'team_id,actor_membership_id,subject_membership_id,action,occurred_at', 'team_id', teamIds),
      all<{ team_id: string; membership_id: string; reason: string; recorded_by: string; recorded_at: string }>(db,
        'team_departures', 'team_id,membership_id,reason,recorded_by,recorded_at', 'team_id', teamIds),
      all<{ id: string; team_id: string; decision: string; decided_by: string; decided_at: string }>(db,
        'team_admin_reviews', 'id,team_id,decision,decided_by,decided_at', 'team_id', teamIds),
      all<{ review_id: string; brand_code: string }>(db, 'team_recount_items', 'review_id,brand_code', 'team_id', teamIds),
      all<{ team_id: string; membership_id: string; kind: string; reason: string | null; recorded_by: string
        witness_user_id: string | null; recorded_at: string; witnessed_at: string | null }>(db, 'team_confirmations',
        'team_id,membership_id,kind,reason,recorded_by,witness_user_id,recorded_at,witnessed_at', 'team_id', teamIds),
    ])
  const history = await all<{ record_id: string; revision: number; pallets: number; cases: number; units: number
    quantity_units: number; method: string; weighing: AuditCount['weighing']; recorded_at: string; superseded_at: string }>(db,
    'team_count_record_history', 'record_id,revision,pallets,cases,units,quantity_units,method,weighing,recorded_at,superseded_at',
    'record_id', records.map(r => r.id))
  const { data: closing } = await db.from('team_session_results').select('acknowledged_by,acknowledged_at,uncounted_count')
    .eq('session_id', sessionId).maybeSingle()

  // Members by membership and by Auth user; admins by e-mail (never member logins, which hold PINs).
  const byMember = new Map(members.map(m => [m.id, m.display_name]))
  const byUser = new Map(members.map(m => [m.user_id, m.display_name]))
  const adminIds = [...new Set([...reviews.map(r => r.decided_by), ...confirmations.flatMap(c => [c.recorded_by, c.witness_user_id]),
    closing?.acknowledged_by].filter((id): id is string => !!id && !byUser.has(id)))]
  const service = createAdminClient()
  const adminName = new Map<string, string>()
  for (const id of adminIds) {
    const { data } = await service.auth.admin.getUserById(id)
    adminName.set(id, 'Admin ' + (data.user?.email ?? id.slice(0, 8)))
  }
  const person = (userId: string | null) => userId ? byUser.get(userId) ?? adminName.get(userId) ?? 'Unknown' : ''
  const authorOf = new Map(assignments.map(a => [a.id, byMember.get(a.membership_id) ?? 'Unknown']))
  const recordById = new Map(records.map(r => [r.id, r]))
  const roundOf = new Map<string, number>()
  for (const id of teamIds) reviews.filter(r => r.team_id === id && r.decision === 'return')
    .sort((a, b) => a.decided_at.localeCompare(b.decided_at)).forEach((r, i) => roundOf.set(r.id, i + 1))

  const counts: AuditCount[] = [
    ...records.map(r => ({ ...r, team: teamName.get(r.team_id)!, person: authorOf.get(r.assignment_id)!, replaced_at: null })),
    ...history.map(h => {
      const r = recordById.get(h.record_id)!
      return { ...h, brand_code: r.brand_code, team: teamName.get(r.team_id)!, person: authorOf.get(r.assignment_id)!, replaced_at: h.superseded_at }
    }),
  ]
  const recs: AuditReconciliation[] = reconciliations.map(r => ({ ...r, team: teamName.get(r.team_id)!,
    person: byMember.get(r.reconciled_by) ?? 'Unknown', round: r.recount_review_id ? roundOf.get(r.recount_review_id) ?? null : null }))
  const finishLabel: Record<string, string> = { request: 'Finish requested', accept: 'Finish accepted', reject: 'Finish rejected' }
  const reviewLabel: Record<string, string> = { accept: 'Result accepted', return: 'Returned for recount', cancel_signing: 'Signature collection cancelled' }
  const events: AuditEvent[] = [
    ...finishes.map(f => ({ team: teamName.get(f.team_id)!, at: f.occurred_at, person: byMember.get(f.actor_membership_id) ?? '',
      action: finishLabel[f.action] ?? f.action, detail: byMember.get(f.subject_membership_id) ?? '' })),
    ...decisions.map(d => ({ team: teamName.get(d.team_id)!, at: d.decided_at, person: byMember.get(d.decided_by) ?? '',
      action: d.decision === 'accept_value' ? 'Weight tolerance value chosen' : 'Sent to reconciliation',
      detail: d.brand_code + (d.quantity_units != null ? ' = ' + d.quantity_units + ' units' : '') })),
    ...departures.map(d => ({ team: teamName.get(d.team_id)!, at: d.recorded_at, person: byMember.get(d.recorded_by) ?? '',
      action: 'Counter marked absent', detail: (byMember.get(d.membership_id) ?? '') + ': ' + d.reason })),
    ...reviews.map(r => ({ team: teamName.get(r.team_id)!, at: r.decided_at, person: person(r.decided_by),
      action: reviewLabel[r.decision] ?? r.decision,
      detail: (roundOf.has(r.id) ? 'Round ' + roundOf.get(r.id) + ': ' : '')
        + recountItems.filter(i => i.review_id === r.id).map(i => i.brand_code).join(', ') })),
    ...confirmations.flatMap(c => {
      const team = teamName.get(c.team_id)!, subject = byMember.get(c.membership_id) ?? ''
      const row = { team, at: c.recorded_at, person: person(c.recorded_by),
        action: c.kind === 'pin' ? 'Signed by PIN' : 'Absence formalized', detail: c.kind === 'pin' ? '' : subject + ': ' + c.reason }
      return c.witness_user_id && c.witnessed_at
        ? [row, { team, at: c.witnessed_at, person: person(c.witness_user_id), action: 'Absence witnessed', detail: subject }] : [row]
    }),
    ...(closing ? [{ team: '(session)', at: closing.acknowledged_at, person: person(closing.acknowledged_by),
      action: 'Uncounted list acknowledged; session closed', detail: closing.uncounted_count + ' product(s) not counted' }] : []),
  ]
  return { counts, reconciliations: recs, events }
}
