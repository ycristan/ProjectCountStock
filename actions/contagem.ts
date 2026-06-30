'use server'

import { createClient } from '@/lib/supabase-server'

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── carregarInventario ────────────────────────────────────────────────────────
// ponytail: loads all items once server-side; client filters in memory (eliminates per-keystroke round trips)
export async function carregarInventario(): Promise<ItemBusca[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const teamId = user.user_metadata?.team_id as string
  const counterRole = user.user_metadata?.counter_role as string

  const [{ data: items }, { data: binData }, { data: entries }, { data: teamRow }] =
    await Promise.all([
      supabase
        .from('inventory_items')
        .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
        .order('brand_code', { ascending: true }),
      supabase.from('item_bin_locations').select('brand_code, bin_location'),
      supabase
        .from('count_entries')
        .select('brand_code, pallets, cases, units')
        .eq('team_id', teamId)
        .eq('counter_role', counterRole)
        .eq('is_joint_recount', false),
      supabase.from('teams').select('session_id').eq('id', teamId).single(),
    ])

  let box_tare_g = 300
  if (teamRow?.session_id) {
    const { data: sessionRow } = await supabase
      .from('count_sessions')
      .select('box_tare_g')
      .eq('id', teamRow.session_id)
      .single()
    if (sessionRow?.box_tare_g) box_tare_g = sessionRow.box_tare_g
  }

  const entryMap = Object.fromEntries((entries ?? []).map((e) => [e.brand_code, e]))
  const binMap: Record<string, string[]> = {}
  for (const b of binData ?? []) {
    if (!binMap[b.brand_code]) binMap[b.brand_code] = []
    binMap[b.brand_code].push(b.bin_location as string)
  }

  return (items ?? []).map((item) => {
    const entry = entryMap[item.brand_code]
    return {
      brand_code: item.brand_code,
      brand_name: item.brand_name,
      bpu: item.bpu,
      pallet_size: item.pallet_size,
      weight_avg: item.weight_avg ?? 0,
      box_tare_g,
      bins: binMap[item.brand_code] ?? [],
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
    return { error: 'Values cannot be negative.' }
  }
  if (
    !Number.isInteger(payload.pallets) ||
    !Number.isInteger(payload.cases) ||
    !Number.isInteger(payload.units)
  ) {
    return { error: 'Count values must be integers.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const teamId = user.user_metadata?.team_id as string
  const counterRole = user.user_metadata?.counter_role as string

  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select('bpu, pallet_size, brand_name')
    .eq('brand_code', payload.brand_code)
    .single()

  if (itemError || !item) return { error: 'Item not found.' }
  // ponytail: apenas bpu=0 bloqueia (divide por zero no RPC); pallet_size=0 é válido
  if (!item.bpu) return { error: 'Item has incomplete data — please contact the admin.' }

  const { data: converted, error: convError } = await supabase.rpc('convert_count', {
    p_pallets: payload.pallets,
    p_cases: payload.cases,
    p_units: payload.units,
    p_bpu: item.bpu,
    p_pallet_size: item.pallet_size,
  })

  if (convError || !converted) return { error: 'Error converting count.' }

  const row = Array.isArray(converted) ? converted[0] : converted
  const final_cases = row.final_cases as number
  const final_units = row.final_units as number
  const is_weight_count = payload.is_weight_count ?? false

  // ponytail: delete+insert evita maybeSingle() quebrar com >1 linha (duplicatas históricas)
  const { error: delError } = await supabase
    .from('count_entries')
    .delete()
    .eq('team_id', teamId)
    .eq('counter_role', counterRole)
    .eq('brand_code', payload.brand_code)
    .eq('is_joint_recount', false)

  if (delError) return { error: `Error clearing previous count: ${delError.message}` }

  const { error } = await supabase.from('count_entries').insert({
    team_id: teamId,
    counter_role: counterRole,
    brand_code: payload.brand_code,
    bin_location: null,
    is_joint_recount: false,
    pallets: payload.pallets,
    cases: payload.cases,
    units: payload.units,
    final_cases,
    final_units,
    is_weight_count,
    entered_at: new Date().toISOString(),
  })

  if (error) return { error: `Error saving: ${error.message}` }

  return { final_cases, final_units, brand_name: item.brand_name }
}
