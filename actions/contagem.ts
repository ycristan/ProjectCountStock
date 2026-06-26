'use server'

import { createClient } from '@/lib/supabase-server'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EntryExistente = {
  bin_location: string | null
  pallets: number
  cases: number
  units: number
}

export type ItemBusca = {
  brand_code: string
  brand_name: string
  bpu: number
  pallet_size: number
  bins: string[]
  binContexto?: string       // BIN pelo qual o item foi encontrado (busca por BIN)
  jaContado: boolean
  entriesExistentes: EntryExistente[]
}

export type LancarContagemPayload = {
  brand_code: string
  bin_location: string | null
  pallets: number
  cases: number
  units: number
}

export type LancarContagemResult = {
  error?: string
  final_cases?: number
  final_units?: number
  brand_name?: string
}

// ─── buscarItens ──────────────────────────────────────────────────────────────

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

  type RawItem = { brand_code: string; brand_name: string; bpu: number; pallet_size: number }
  let items: RawItem[] = []
  let binContextoMap: Record<string, string> = {}

  // 1. Exact brand_code match (case-insensitive)
  const { data: exactMatch } = await supabase
    .from('inventory_items')
    .select('brand_code, brand_name, bpu, pallet_size')
    .ilike('brand_code', termoTrimmed)
    .limit(1)

  if (exactMatch && exactMatch.length > 0) {
    items = exactMatch
  } else {
    // 2. BIN match (prefix)
    const { data: binMatch } = await supabase
      .from('item_bin_locations')
      .select('brand_code, bin_location')
      .ilike('bin_location', `${termoTrimmed}%`)
      .limit(20)

    if (binMatch && binMatch.length > 0) {
      const codes = [...new Set(binMatch.map((b) => b.brand_code))]
      const { data: binItems } = await supabase
        .from('inventory_items')
        .select('brand_code, brand_name, bpu, pallet_size')
        .in('brand_code', codes)
      items = binItems ?? []
      binContextoMap = Object.fromEntries(
        binMatch.map((b) => [b.brand_code, b.bin_location])
      )
    } else {
      // 3. Brand name search
      const { data: nameMatch } = await supabase
        .from('inventory_items')
        .select('brand_code, brand_name, bpu, pallet_size')
        .ilike('brand_name', `%${termoTrimmed}%`)
        .limit(20)
      items = nameMatch ?? []
    }
  }

  if (items.length === 0) return []

  const codes = items.map((i) => i.brand_code)

  // Buscar BINs de todos os itens
  const { data: binData } = await supabase
    .from('item_bin_locations')
    .select('brand_code, bin_location')
    .in('brand_code', codes)

  // Buscar entries existentes deste contador
  const { data: entries } = await supabase
    .from('count_entries')
    .select('brand_code, bin_location, pallets, cases, units')
    .eq('team_id', teamId)
    .eq('counter_role', counterRole)
    .in('brand_code', codes)

  return items.map((item) => {
    const bins = (binData ?? [])
      .filter((b) => b.brand_code === item.brand_code)
      .map((b) => b.bin_location as string)

    const entriesExistentes: EntryExistente[] = (entries ?? [])
      .filter((e) => e.brand_code === item.brand_code)
      .map((e) => ({
        bin_location: e.bin_location,
        pallets: e.pallets,
        cases: e.cases,
        units: e.units,
      }))

    return {
      brand_code: item.brand_code,
      brand_name: item.brand_name,
      bpu: item.bpu,
      pallet_size: item.pallet_size,
      bins,
      binContexto: binContextoMap[item.brand_code],
      jaContado: entriesExistentes.length > 0,
      entriesExistentes,
    }
  })
}

// ─── lancarContagem ───────────────────────────────────────────────────────────

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

  // Buscar dados do item
  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select('bpu, pallet_size, brand_name')
    .eq('brand_code', payload.brand_code)
    .single()

  if (itemError || !item) return { error: 'Item não encontrado.' }
  if (!item.bpu || !item.pallet_size) {
    return { error: 'Item com dados incompletos — contate o admin.' }
  }

  // Converter via RPC
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

  // Verificar se entry já existe (índices parciais — não usar upsert direto)
  const existsQuery = supabase
    .from('count_entries')
    .select('id')
    .eq('team_id', teamId)
    .eq('counter_role', counterRole)
    .eq('brand_code', payload.brand_code)

  const { data: existing } = await (payload.bin_location === null
    ? existsQuery.is('bin_location', null)
    : existsQuery.eq('bin_location', payload.bin_location)
  ).maybeSingle()

  const updateData = {
    pallets: payload.pallets,
    cases: payload.cases,
    units: payload.units,
    final_cases,
    final_units,
    entered_at: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await supabase
      .from('count_entries')
      .update(updateData)
      .eq('id', existing.id)
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
  } else {
    // Race: concurrent submit can violate partial unique index; tolerable (one device per counter)
    const { error } = await supabase.from('count_entries').insert({
      team_id: teamId,
      counter_role: counterRole,
      brand_code: payload.brand_code,
      bin_location: payload.bin_location,
      is_joint_recount: false,
      ...updateData,
    })
    if (error) return { error: `Erro ao salvar: ${error.message}` }
  }

  return { final_cases, final_units, brand_name: item.brand_name }
}
