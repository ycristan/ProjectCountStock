'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function finalizarEquipe(
  teamId: string,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'admin') return { error: 'Não autorizado.' }

  const admin = createAdminClient()
  const { error } = await admin.rpc('finalize_team_count', { p_team_id: teamId })
  if (error) return { error: error.message }
  return { success: true }
}

export async function resolverItem(
  itemId: string,
  finalCases: number,
  finalUnits: number,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'admin') return { error: 'Não autorizado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('reconciliation_items')
    .update({
      status: 'resolvido',
      independente_cases: finalCases,
      independente_units: finalUnits,
    })
    .eq('id', itemId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function confirmarReconciliacao(
  teamId: string,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'admin') return { error: 'Não autorizado.' }

  const admin = createAdminClient()

  const { data: remaining } = await admin
    .from('reconciliation_items')
    .select('id')
    .eq('team_id', teamId)
    .eq('status', 'discrepancia')

  if (remaining && remaining.length > 0) return { error: 'Ainda há discrepâncias pendentes.' }

  const { error } = await admin
    .from('teams')
    .update({ status: 'reconciliada' })
    .eq('id', teamId)

  if (error) return { error: error.message }
  return { success: true }
}
