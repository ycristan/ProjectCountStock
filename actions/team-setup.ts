'use server'

import { isAdmin } from '@/lib/authorization'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { generatePin, pinPassword } from '@/lib/pin-credentials'
import { reportTeamContextError } from '@/lib/report-team-context-error'
import type { TeamDraft, SetupJob } from '@/lib/team-setup-types'
import type { Credencial } from '@/actions/sessao'

function cards(job: SetupJob): Credencial[] {
  return job.plan.flatMap(t => {
    let order = 0
    return t.members.map(m => ({ team: t.name, team_pin: t.pin, name: m.name, user_pin: m.pin,
      role: m.role === 'independent' ? 'Independent' : 'Counter ' + (++order) }))
  })
}

export async function readTeamSetup(sessionId: string) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true' || !(await isAdmin())) return { error: 'Not authorized.' }
  const db = await createClient()
  const { data, error } = await db.rpc('read_team_setup', { p_session: sessionId })
  if (error) {
    const eventId = await reportTeamContextError('team.setup')
    return { error: 'Saved setup is unavailable. Please retry.' + (eventId ? ' Reference: ' + eventId : '') }
  }
  const job = data as SetupJob | null
  // Never send pending credentials or internal Auth identifiers to the form.
  return { draft: job?.draft, credenciais: job?.complete ? cards(job) : undefined }
}

export async function createTeamSetup(sessionId: string, draft: TeamDraft[]): Promise<{
  error?: string; draft?: TeamDraft[]; credenciais?: Credencial[]
}> {
  if (process.env.TEAM_SETUP_ENABLED !== 'true' || !(await isAdmin())) return { error: 'Not authorized.' }
  if (!Array.isArray(draft) || !draft.length || draft.some(t => !t || typeof t.name !== 'string' || !t.name.trim() ||
    !Array.isArray(t.members) || t.members.length < 3 ||
    t.members.filter(m => m?.role === 'independent').length !== 1 ||
    t.members.some(m => !m || typeof m.name !== 'string' || !m.name.trim() || !['counter', 'independent'].includes(m.role)))) {
    return { error: 'Enter every name, at least two counters and exactly one Independent per team.' }
  }
  const normalized = draft.map(t => ({ name: t.name.trim(), members: t.members.map(m => ({ name: m.name.trim(), role: m.role })) }))
  const db = await createClient()
  let job: SetupJob | null = null
  try {
    // Reservations are authoritative; retry collisions before any Auth side effects.
    for (let attempt = 0; attempt < 5; attempt++) {
      const used = new Set<string>()
      const plan = normalized.map(t => {
        const pins = new Set<string>()
        return { ...t, pin: generatePin(used), members: t.members.map(m => ({ ...m, pin: generatePin(pins) })) }
      })
      const result = await db.rpc('reserve_team_setup', { p_session: sessionId, p_draft: normalized, p_plan: plan })
      if (!result.error) { job = result.data as SetupJob; break }
      if (result.error.code !== '23505') throw new Error('Setup reservation failed')
    }
    if (!job) throw new Error('Setup reservation unavailable')
    if (job.complete) return { draft: job.draft, credenciais: cards(job) }
    const admin = createAdminClient()
    for (const team of job.plan) for (const member of team.members) {
      if (member.userId) continue
      // Protected app metadata identifies only this provisioning operation.
      // Runtime roles and permissions always come from protected memberships.
      let created = false
      try {
        const result = await admin.auth.admin.createUser({
          email: team.pin + member.pin + '@count.local',
          password: pinPassword(team.pin, member.pin), email_confirm: true,
          user_metadata: { full_name: member.name }, app_metadata: { team_setup_job: job.id },
        })
        created = !result.error && !!result.data.user
      } catch { /* A timed-out Auth request may already have committed. */ }
      if (!created) {
        const recovered = await db.rpc('read_team_setup', { p_session: sessionId })
        const state = recovered.data as SetupJob | null
        const found = state?.plan.find(t => t.commandId === team.commandId)?.members.find(m => m.pin === member.pin)
        if (recovered.error || !found?.userId) throw new Error('Login provisioning incomplete')
      }
    }
    // Auth cannot join a Postgres transaction. The saved plan makes the gap
    // recoverable; only this checked transaction publishes ALL memberships.
    const result = await db.rpc('complete_team_setup', { p_session: sessionId })
    if (result.error || !result.data?.complete) throw new Error('Setup completion failed')
    job = result.data as SetupJob
    return { draft: job.draft, credenciais: cards(job) }
  } catch {
    // A reservation response can be lost after committing. Recover its draft too.
    if (!job) {
      try {
        const recovered = await db.rpc('read_team_setup', { p_session: sessionId })
        if (!recovered.error) job = recovered.data as SetupJob | null
      } catch { /* Reload can recover the persisted plan when connectivity returns. */ }
    }
    const eventId = await reportTeamContextError('team.setup')
    return { draft: job?.draft, error: 'Setup was not completed. Retry to resume the same logins.' + (eventId ? ' Reference: ' + eventId : '') }
  }
}
