'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export type ReconcItemLista = {
  id: string
  brand_code: string
  brand_name: string
  bin_location: string | null
  status: 'discrepancia' | 'resolvido'
  is_weight_count: boolean
  contador_1_cases: number | null
  contador_1_units: number | null
  contador_2_cases: number | null
  contador_2_units: number | null
  independente_cases: number | null
  independente_units: number | null
  reconciliated_cases: number | null
  reconciliated_units: number | null
  weight_avg: number
  bpu: number
  pallet_size: number
  box_tare_g: number
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
      'id, brand_code, bin_location, status, is_weight_count, contador_1_cases, contador_1_units, contador_2_cases, contador_2_units, independente_cases, independente_units, reconciliated_cases, reconciliated_units',
    )
    .eq('team_id', teamId)
    .in('status', ['discrepancia', 'resolvido'])
    .order('brand_code')

  if (!items?.length) return []

  const { data: teamRow } = await admin.from('teams').select('session_id').eq('id', teamId).single()
  let box_tare_g = 300
  if (teamRow?.session_id) {
    const { data: sessionRow } = await admin
      .from('count_sessions')
      .select('box_tare_g')
      .eq('id', teamRow.session_id)
      .single()
    if (sessionRow?.box_tare_g) box_tare_g = sessionRow.box_tare_g
  }

  const codes = [...new Set(items.map((i) => i.brand_code))]
  const { data: invItems } = await admin
    .from('inventory_items')
    .select('brand_code, brand_name, weight_avg, bpu, pallet_size')
    .in('brand_code', codes)

  const invMap: Record<string, { brand_name: string; weight_avg: number; bpu: number; pallet_size: number }> = {}
  for (const i of invItems ?? []) {
    invMap[i.brand_code] = {
      brand_name: i.brand_name,
      weight_avg: i.weight_avg ?? 0,
      bpu: i.bpu ?? 1,
      pallet_size: i.pallet_size ?? 1,
    }
  }

  return items.map((i) => ({
    ...i,
    brand_name: invMap[i.brand_code]?.brand_name ?? i.brand_code,
    weight_avg: invMap[i.brand_code]?.weight_avg ?? 0,
    bpu: invMap[i.brand_code]?.bpu ?? 1,
    pallet_size: invMap[i.brand_code]?.pallet_size ?? 1,
    box_tare_g,
    is_weight_count: i.is_weight_count ?? false,
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
