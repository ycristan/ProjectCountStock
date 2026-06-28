'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export type ReconcItemLista = {
  id: string
  brand_code: string
  brand_name: string
  bin_location: string | null
  status: 'discrepancia' | 'resolvido'
  contador_1_cases: number | null
  contador_1_units: number | null
  contador_2_cases: number | null
  contador_2_units: number | null
  independente_cases: number | null
  independente_units: number | null
  reconciliated_cases: number | null
  reconciliated_units: number | null
}

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

export async function listarDiscrepancias(): Promise<ReconcItemLista[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const teamId = user.user_metadata?.team_id as string
  const admin = createAdminClient()

  const { data: items } = await admin
    .from('reconciliation_items')
    .select(
      'id, brand_code, bin_location, status, contador_1_cases, contador_1_units, contador_2_cases, contador_2_units, independente_cases, independente_units, reconciliated_cases, reconciliated_units',
    )
    .eq('team_id', teamId)
    .in('status', ['discrepancia', 'resolvido'])
    .order('brand_code')

  if (!items?.length) return []

  const codes = [...new Set(items.map((i) => i.brand_code))]
  const { data: invItems } = await supabase
    .from('inventory_items')
    .select('brand_code, brand_name')
    .in('brand_code', codes)

  const nameMap: Record<string, string> = {}
  for (const i of invItems ?? []) nameMap[i.brand_code] = i.brand_name

  return items.map((i) => ({
    ...i,
    brand_name: nameMap[i.brand_code] ?? i.brand_code,
    status: i.status as 'discrepancia' | 'resolvido',
  }))
}

export async function resolverItemReconciliacao(
  itemId: string,
  cases: number,
  units: number,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const role = user.user_metadata?.counter_role
  if (role !== 'independente') return { error: 'Apenas o contador independente pode registrar reconciliações.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('reconciliation_items')
    .update({
      reconciliated_cases: cases,
      reconciliated_units: units,
      status: 'resolvido',
    })
    .eq('id', itemId)

  return error ? { error: error.message } : {}
}

export async function confirmarReconciliacao(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const role = user.user_metadata?.counter_role
  if (role !== 'independente') return { error: 'Apenas o contador independente pode confirmar a reconciliação.' }

  const teamId = user.user_metadata?.team_id as string
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

  return error ? { error: error.message } : {}
}
