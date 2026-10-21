'use server'

import { createClient } from '@/lib/supabase-server'
import { reportTeamContextError } from '@/lib/report-team-context-error'

export type TeamSessionClosing = {
  teams: { teamId: string; name: string; phase: string | null }[]
  ready: boolean
  uncounted: { brandCode: string; brandName: string; bins: string[] }[]
  closed: { acknowledgedAt: string; uncountedCount: number } | null
}

export async function readTeamSessionClosing(sessionId: string): Promise<TeamSessionClosing | null> {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return null
  const db = await createClient()
  const { data, error } = await db.rpc('read_team_session_closing', { p_session: sessionId })
  if (error) {
    if (error.code !== '42501') await reportTeamContextError('team.count')
    return null
  }
  return data as TeamSessionClosing
}

// R13 (2026-10-07): the admin acknowledges exactly the list shown; the database
// rejects it if the list changed, then freezes the consolidation and closes the session.
export async function closeTeamSession(sessionId: string, uncounted: string[]) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return { error: 'Team access unavailable.' }
  const db = await createClient()
  const { error } = await db.rpc('close_team_session', { p_session: sessionId, p_uncounted: uncounted })
  if (!error) return {}
  if (!['40001', '42501', 'P0001'].includes(error.code)) await reportTeamContextError('team.count')
  return { error: error.code === '40001' ? 'The list changed. Refresh and review it again.'
    : error.message === 'Every team must be closed before the session' ? 'Every team must be closed first.'
    : 'Not closed. Refresh and try again.' }
}
