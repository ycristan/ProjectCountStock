'use server'

import { isAdmin } from '@/lib/authorization'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import { generatePin, pinPassword } from '@/lib/pin-credentials'

// Auditor: one shared, read-only login per session (DECISOES.md, 24/11). The login is the
// same two 4-digit PINs as a team; the database decides what it may read. Every function
// that changes anything starts with isAdmin().
export type AuditorAccess = { team_code: string; pin: string; revoked: boolean }

export async function readAuditorAccess(sessionId: string): Promise<AuditorAccess | null> {
  if (!(await isAdmin())) return null
  const { data } = await createAdminClient().from('session_auditors')
    .select('team_code, pin, revoked_at').eq('session_id', sessionId).maybeSingle()
  return data ? { team_code: data.team_code, pin: data.pin, revoked: !!data.revoked_at } : null
}

export async function createAuditorAccess(sessionId: string): Promise<{ error?: string; access?: AuditorAccess }> {
  if (!(await isAdmin())) return { error: 'Not authorized.' }
  const admin = createAdminClient()
  const { data: session } = await admin.from('count_sessions').select('status').eq('id', sessionId).maybeSingle()
  if (!session || session.status === 'fechada') return { error: 'Session is not open.' }
  const existing = await readAuditorAccess(sessionId)
  if (existing && !existing.revoked) return { access: existing }
  try {
    if (existing) {
      // A revoked access is replaced by a new one: deleting its login cascades to its row.
      const { data: old } = await admin.from('session_auditors').select('user_id').eq('session_id', sessionId).single()
      if (old) await admin.auth.admin.deleteUser(old.user_id)
      await admin.from('session_auditors').delete().eq('session_id', sessionId)
    }
    // The code never repeats a team code, so the login e-mail cannot clash with a counter's.
    const teams = await fetchAllRows<{ team_pin: string }>((from, to) => admin.from('teams').select('team_pin').order('id').range(from, to))
    const auditors = await fetchAllRows<{ team_code: string }>((from, to) => admin.from('session_auditors').select('team_code').order('session_id').range(from, to))
    const used = new Set<string>([...teams.map(t => t.team_pin), ...auditors.map(a => a.team_code)])
    const code = generatePin(used)
    const pin = generatePin(new Set())
    const created = await admin.auth.admin.createUser({
      email: code + pin + '@count.local', password: pinPassword(code, pin), email_confirm: true,
      user_metadata: { full_name: 'Auditor' },
    })
    if (created.error || !created.data.user) return { error: 'Could not create the Auditor access. Please retry.' }
    const userId = created.data.user.id
    const rows = await Promise.all([
      admin.from('app_user_access').insert({ user_id: userId, access_kind: 'auditor' }),
      admin.from('session_auditors').insert({ session_id: sessionId, user_id: userId, team_code: code, pin }),
    ])
    if (rows.some(r => r.error)) {
      await admin.auth.admin.deleteUser(userId) // cascades to both rows
      return { error: 'Could not save the Auditor access. Please retry.' }
    }
    return { access: { team_code: code, pin, revoked: false } }
  } catch {
    return { error: 'Could not create the Auditor access. Please retry.' }
  }
}

export async function revokeAuditorAccess(sessionId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Not authorized.' }
  const { error } = await createAdminClient().from('session_auditors')
    .update({ revoked_at: new Date().toISOString() }).eq('session_id', sessionId).is('revoked_at', null)
  return error ? { error: 'Could not revoke the access. Please retry.' } : {}
}

// The Auditor's own screen. The session comes from the database (their login), never from the URL.
export async function readAuditorTeams(): Promise<{ id: string; name: string }[] | null> {
  const { data, error } = await (await createClient()).rpc('read_auditor_teams')
  return error ? null : data as { id: string; name: string }[]
}
