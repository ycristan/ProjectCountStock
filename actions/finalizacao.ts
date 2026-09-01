'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { getTeamCounterAccess } from '@/lib/authorization'

export type FinalizacaoResult = {
  error?: string
  success?: boolean
  ja_finalizado?: boolean
}

export async function finalizarContagem(): Promise<FinalizacaoResult> {
  const access = await getTeamCounterAccess()
  if (!access) return { error: 'Not authenticated.' }

  const admin = createAdminClient()
  const { data: account, error: fetchError } = await admin
    .from('counter_accounts')
    .select('id, finalized_at')
    .eq('team_id', access.teamId)
    .eq('role', access.counterRole)
    .single()

  if (fetchError || !account) return { error: 'Account not found.' }
  if (account.finalized_at) return { success: true, ja_finalizado: true }

  const { error } = await admin
    .from('counter_accounts')
    .update({ finalized_at: new Date().toISOString() })
    .eq('id', account.id)

  return error ? { error: `Error finalising: ${error.message}` } : { success: true }
}

export async function getFinalizacaoStatus(): Promise<{ finalized_at: string | null }> {
  const access = await getTeamCounterAccess()
  if (!access) return { finalized_at: null }

  const admin = createAdminClient()
  const { data } = await admin
    .from('counter_accounts')
    .select('finalized_at')
    .eq('team_id', access.teamId)
    .eq('role', access.counterRole)
    .maybeSingle()

  return { finalized_at: data?.finalized_at ?? null }
}
