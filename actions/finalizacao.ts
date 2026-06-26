'use server'

import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@/lib/supabase-admin'

export type FinalizacaoResult = {
  error?: string
  success?: boolean
  ja_finalizado?: boolean
}

export async function finalizarContagem(): Promise<FinalizacaoResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const teamId = user.user_metadata?.team_id as string
  const counterRole = user.user_metadata?.counter_role as string
  if (!teamId || !counterRole) return { error: 'Dados de sessão inválidos.' }

  const admin = createAdminClient()

  const { data: account, error: fetchError } = await admin
    .from('counter_accounts')
    .select('id, finalized_at')
    .eq('team_id', teamId)
    .eq('role', counterRole)
    .single()

  if (fetchError || !account) return { error: 'Conta não encontrada.' }
  if (account.finalized_at) return { success: true, ja_finalizado: true }

  const { error } = await admin
    .from('counter_accounts')
    .update({ finalized_at: new Date().toISOString() })
    .eq('id', account.id)

  if (error) return { error: `Erro ao finalizar: ${error.message}` }
  return { success: true }
}

export async function getFinalizacaoStatus(): Promise<{ finalized_at: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { finalized_at: null }

  const teamId = user.user_metadata?.team_id as string
  const counterRole = user.user_metadata?.counter_role as string

  const admin = createAdminClient()
  const { data } = await admin
    .from('counter_accounts')
    .select('finalized_at')
    .eq('team_id', teamId)
    .eq('role', counterRole)
    .maybeSingle()

  return { finalized_at: data?.finalized_at ?? null }
}
