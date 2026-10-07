'use server'

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { pinPassword } from '@/lib/pin-credentials'
import { reportTeamContextError } from '@/lib/report-team-context-error'
import type { TeamSigning } from '@/lib/team-count-types'

type Result = { error?: string; phase?: string }

function enabled() { return process.env.TEAM_SETUP_ENABLED === 'true' }

async function failure(error: { code?: string; message?: string }, fallback: string): Promise<Result> {
  if (!['40001', '42501', '22023', 'P0001'].includes(error.code ?? '')) await reportTeamContextError('team.count')
  if (error.code === '40001') return { error: 'The team changed. Refresh and try again.' }
  if (error.message === 'Already confirmed') return { error: 'Already confirmed.' }
  if (error.message === 'Absence needs a reason') return { error: 'Write the reason.' }
  return { error: fallback }
}

// R11: the signer proves identity with their own PIN. The server signs in as that
// person and the database records the signature under their session, never the
// screen owner's. The caller must already see the team. PINs are never logged.
async function asMember<T>(teamId: string, membershipId: string, pin: string, role: 'counter' | 'independent' | null,
  action: (db: SupabaseClient) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>,
): Promise<{ data?: T; error?: { code?: string; message?: string }; denied?: string }> {
  if (!/^\d{4}$/.test(pin)) return { denied: 'Enter the 4-digit PIN.' }
  const caller = await createClient()
  const { error: visible } = await caller.rpc('read_team_signing', { p_team: teamId })
  if (visible) return { denied: 'Team access unavailable.' }
  const admin = createAdminClient()
  const [{ data: team }, { data: member }] = await Promise.all([
    admin.from('teams').select('team_pin').eq('id', teamId).single(),
    admin.from('team_memberships').select('user_id,role').eq('team_id', teamId).eq('id', membershipId).single(),
  ])
  if (!team?.team_pin || !member || (role && member.role !== role)) return { denied: 'Person not found in this team.' }
  const db = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: login } = await db.auth.signInWithPassword({
    email: team.team_pin + pin + '@count.local', password: pinPassword(team.team_pin, pin) })
  if (!login.session || login.user?.id !== member.user_id) {
    if (login.session) await admin.auth.admin.signOut(login.session.access_token, 'local')
    return { denied: 'PIN does not match this person.' }
  }
  try {
    const { data, error } = await action(db)
    return error ? { error } : { data: data ?? undefined }
  } finally {
    // This one-off session ends here; the person's own device stays signed in.
    await admin.auth.admin.signOut(login.session.access_token, 'local')
  }
}

export async function readTeamSigning(teamId: string): Promise<TeamSigning | null> {
  if (!enabled()) return null
  const db = await createClient()
  const { data, error } = await db.rpc('read_team_signing', { p_team: teamId })
  if (error) {
    if (error.code !== '42501') await reportTeamContextError('team.count')
    return null
  }
  return data as TeamSigning | null
}

export async function signWithPin(teamId: string, membershipId: string, pin: string, version: string, command: string): Promise<Result> {
  if (!enabled()) return { error: 'Team access unavailable.' }
  const r = await asMember<{ phase: string }>(teamId, membershipId, pin, null,
    db => db.rpc('sign_team_result', { p_team: teamId, p_version: version, p_command: command }))
  if (r.denied) return { error: r.denied }
  if (r.error) return failure(r.error, 'Signature not saved. Refresh and try again.')
  return { phase: r.data?.phase }
}

// Counter absent at signature: the Independent confirms with their own PIN.
export async function formalizeCounterAbsence(teamId: string, membershipId: string, reason: string,
  independentId: string, independentPin: string, version: string, command: string): Promise<Result> {
  if (!enabled()) return { error: 'Team access unavailable.' }
  const r = await asMember<{ phase: string }>(teamId, independentId, independentPin, 'independent',
    db => db.rpc('formalize_counter_absence', { p_team: teamId, p_version: version, p_membership: membershipId,
      p_reason: reason, p_command: command }))
  if (r.denied) return { error: r.denied === 'PIN does not match this person.' ? 'Independent PIN does not match.' : r.denied }
  if (r.error) return failure(r.error, 'Absence not saved. Refresh and try again.')
  return { phase: r.data?.phase }
}

// Independent absent: the signed-in admin records the reason.
export async function recordIndependentAbsence(teamId: string, reason: string, version: string, command: string): Promise<Result> {
  if (!enabled()) return { error: 'Team access unavailable.' }
  const db = await createClient()
  const { error } = await db.rpc('record_independent_absence', { p_team: teamId, p_version: version, p_reason: reason, p_command: command })
  return error ? failure(error, 'Absence not saved. Refresh and try again.') : { phase: 'signing' }
}

// Witness of the Independent absence: a present counter by PIN, or the signed-in admin.
export async function witnessIndependentAbsence(teamId: string, version: string, command: string,
  witness: { membershipId: string; pin: string } | null): Promise<Result> {
  if (!enabled()) return { error: 'Team access unavailable.' }
  const args = { p_team: teamId, p_version: version, p_command: command }
  if (witness) {
    const r = await asMember<{ phase: string }>(teamId, witness.membershipId, witness.pin, 'counter',
      db => db.rpc('witness_independent_absence', args))
    if (r.denied) return { error: r.denied }
    if (r.error) return failure(r.error, 'Witness not saved. Refresh and try again.')
    return { phase: r.data?.phase }
  }
  const db = await createClient()
  const { data, error } = await db.rpc('witness_independent_absence', args)
  return error ? failure(error, 'Witness not saved. Refresh and try again.') : { phase: (data as { phase: string }).phase }
}

export async function cancelTeamSigning(teamId: string, version: string, command: string): Promise<Result> {
  if (!enabled()) return { error: 'Team access unavailable.' }
  const db = await createClient()
  const { error } = await db.rpc('cancel_team_signing', { p_team: teamId, p_version: version, p_command: command })
  if (error?.message === 'First confirmation received; collection cannot be cancelled')
    return { error: 'A confirmation was already received; the collection cannot be cancelled.' }
  return error ? failure(error, 'Not cancelled. Refresh and try again.') : { phase: 'admin_review' }
}

// R08: the Independent records, on their own session, a counter who left during counting.
export async function markCounterAbsent(teamId: string, membershipId: string, reason: string, revision: string, command: string): Promise<Result> {
  if (!enabled()) return { error: 'Team access unavailable.' }
  const db = await createClient()
  const { data, error } = await db.rpc('mark_team_counter_absent', {
    p_team: teamId, p_membership: membershipId, p_reason: reason, p_expected_revision: revision, p_command: command })
  return error ? failure(error, 'Absence not saved. Refresh and try again.') : { phase: (data as { phase: string }).phase }
}
