import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export type TeamCounterAccess = {
  teamId: string
  counterRole: 'contador_1' | 'contador_2' | 'independente'
}

async function authenticatedUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function isAdmin(): Promise<boolean> {
  const userId = await authenticatedUserId()
  if (!userId) return false

  const admin = createAdminClient()
  const { data } = await admin
    .from('app_user_access')
    .select('user_id')
    .eq('user_id', userId)
    .eq('access_kind', 'admin')
    .maybeSingle()

  return Boolean(data)
}

export async function isSoloCounter(): Promise<boolean> {
  const userId = await authenticatedUserId()
  if (!userId) return false

  const admin = createAdminClient()
  const { data } = await admin
    .from('app_user_access')
    .select('user_id')
    .eq('user_id', userId)
    .eq('access_kind', 'solo_counter')
    .maybeSingle()

  return Boolean(data)
}

export async function getTeamCounterAccess(): Promise<TeamCounterAccess | null> {
  const userId = await authenticatedUserId()
  if (!userId) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('counter_accounts')
    .select('team_id, role')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (!data) return null
  return {
    teamId: data.team_id,
    counterRole: data.role as TeamCounterAccess['counterRole'],
  }
}
