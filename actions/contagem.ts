'use server'

import { createClient } from '@/lib/supabase-server'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EntryExistente = {
  pallets: number
  cases: number
  units: number
}

export type ItemBusca = {
  brand_code: string
  brand_name: string
  bpu: number
  pallet_size: number
  weight_avg: number
  box_tare_g: number
  bins: string[]
  jaContado: boolean
  entryExistente: EntryExistente | null
}

export type LancarContagemPayload = {
  brand_code: string
  pallets: number
  cases: number
  units: number
  is_weight_count?: boolean
}

export type LancarContagemResult = {
  error?: string
  final_cases?: number
  final_units?: number
  brand_name?: string
}

// ─── buscarItens ───────────────────────────────────────────────────────────────

export async function buscarItens(termo: string): Promise<ItemBusca[]> {
  const termoTrimmed = termo.trim()
  if (!termoTrimmed) return []

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const teamId = user.user_metadata?.team_id as string
  const counterRole = user.user_metadata?.counter_role as string

  type RawItem = { brand_code: string; brand_name: string; bpu: number; pallet_size: number; weight_avg: number }
  let items: RawItem[] = []

  const { data: exactMatch } = await supabase
    .from('inventory_items')
    .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
    .ilike('brand_code', termoTrimmed)
    .limit(1)

  if (exactMatch && exactMatch.length > 0) {
    items = exactMatch
  } else {
    const { data: binMatch } = await supabase
      .from('item_bin_locations')
      .select('brand_code, bin_location')
      .ilike('bin_location', `${termoTrimmed}%`)
      .limit(20)

    if (binMatch && binMatch.length > 0) {
      const codes = [...new Set(binMatch.map((b) => b.brand_code))]
      const { data: binItems } = await supabase
        .from('inventory_items')
        .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
        .in('brand_code', codes)
      items = binItems ?? []
    } else {
      const { data: nameMatch } = await supabase
        .from('inventory_items')
        .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
        .ilike('brand_name', `%${termoTrimmed}%`)
        .limit(20)
      items = nameMatch ?? []
    }
  }

  if (items.length === 0) return []

  const codes = items.map((i) => i.brand_code)

  let box_tare_g = 300
  const { data: teamRow } = await supabase
    .from('teams')
    .select('session_id')
    .eq('id', teamId)
    .single()
  if (teamRow?.session_id) {
    const { data: sessionRow } = await supabase
      .from('count_sessions')
      .select('box_tare_g')
      .eq('id', teamRow.session_id)
      .single()
    if (sessionRow?.box_tare_g) box_tare_g = sessionRow.box_tare_g
  }

  const { data: binData } = await supabase
    .from('item_bin_locations')
    .select('brand_code, bin_location')
    .in('brand_code', codes)

  const { data: entries } = await supabase
    .from('count_entries')
    .select('brand_code, pallets, cases, units')
    .eq('team_id', teamId)
    .eq('counter_role', counterRole)
    .in('brand_code', codes)

  return items.map((item) => {
    const bins = (binData ?? [])
      .filter((b) => b.brand_code === item.brand_code)
      .map((b) => b.bin_location as string)

    const entry = (entries ?? []).find((e) => e.brand_code === item.brand_code)

    return {
      brand_code: item.brand_code,
      brand_name: item.brand_name,
      bpu: item.bpu,
      pallet_size: item.pallet_size,
      weight_avg: item.weight_avg ?? 0,
      box_tare_g,
      bins,
      jaContado: !!entry,
      entryExistente: entry
        ? { pallets: entry.pallets, cases: entry.cases, units: entry.units }
        : null,
    }
  })
}

// ─── lancarContagem ────────────────────────────────────────────────────────────

export async function lancarContagem(
  payload: LancarContagemPayload
): Promise<LancarContagemResult> {
  if (payload.pallets < 0 || payload.cases < 0 || payload.units < 0) {
    return { error: 'Valores não podem ser negativos.' }
  }
  if (!Number.isInteger(payload.pallets) || !Number.isInteger(payload.cases) || !Number.isInteger(payload.units)) {
    return { error: 'Valores de contagem devem ser números inteiros' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const teamId = user.user_metadata?.team_id as string
  const counterRole = user.user_metadata?.counter_role as string

  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select('bpu, pallet_size, brand_name')
    .eq('brand_code', payload.brand_code)
    .single()

  if (itemError || !item) return { error: 'Item não encontrado.' }
  // ponytail: apenas bpu=0 bloqueia (divide por zero no RPC); pallet_size=0 é válido
  if (!item.bpu) return { error: 'Item com dados incompletos — contate o admin.' }

  const { data: converted, error: convError } = await supabase.rpc('convert_count', {
    p_pallets: payload.pallets,
    p_cases: payload.cases,
    p_units: payload.units,
    p_bpu: item.bpu,
    p_pallet_size: item.pallet_size,
  })

  if (convError || !converted) return { error: 'Erro ao converter contagem.' }

  const row = Array.isArray(converted) ? converted[0] : converted
  const final_cases = row.final_cases as number
  const final_units = row.final_units as number
  const is_weight_count = payload.is_weight_count ?? false

  const { data: existing } = await supabase
    .from('count_entries')
    .select('id')
    .eq('team_id', teamId)
    .eq('counter_role', counterRole)
    .eq('brand_code', payload.brand_code)
    .maybeSingle()

  const updateData = {
    pallets: payload.pallets,
    cases: payload.cases,
    units: payload.units,
    final_cases,
    final_units,
    is_weight_count,
    entered_at: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await supabase
      .from('count_entries')
      .update(updateData)
      .eq('id', existing.id)
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
  } else {
    const { error } = await supabase.from('count_entries').insert({
      team_id: teamId,
      counter_role: counterRole,
      brand_code: payload.brand_code,
      bin_location: null,
      is_joint_recount: false,
      ...updateData,
    })
    if (error) return { error: `Erro ao salvar: ${error.message}` }
  }

  return { final_cases, final_units, brand_name: item.brand_name }
}
