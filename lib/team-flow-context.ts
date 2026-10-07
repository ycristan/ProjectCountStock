import 'server-only'
import { createClient } from '@/lib/supabase-server'

export type TeamFlowContext = {
  flowVersion: 2
  membershipId: string
  teamId: string
  sessionId: string
  warehouseId: string
  warehouseName: string
  teamName: string
  displayName: string
  role: 'counter' | 'independent'
  displayOrder: number
  finishState: 'counting' | 'requested' | 'accepted'
  phase: 'setup' | 'counting' | 'reconciling' | 'admin_review' | 'signing'
  revision: string
}

// No cache, service key or legacy fallback. Each call resolves current membership.
// This describes context; mutation RPCs must still authorize their own transaction.
export async function getTeamFlowContexts(teamId?: string): Promise<
  { ok: true; teams: TeamFlowContext[] } |
  { ok: false; reason: 'unauthenticated' | 'unavailable' }
> {
  const db = await createClient()
  const { data: { user }, error: authError } = await db.auth.getUser()
  if (authError || !user) return { ok: false, reason: 'unauthenticated' }
  const { data, error } = await db.rpc('my_team_flow_contexts', { p_team: teamId ?? null })
  if (error || !Array.isArray(data)) return { ok: false, reason: 'unavailable' }
  return { ok: true, teams: data as TeamFlowContext[] }
}
