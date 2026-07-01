'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import type { LancarContagemPayload, LancarContagemResult } from '@/actions/contagem'

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.user_metadata?.role === 'admin'
}

export async function criarSoloSessao(title: string): Promise<{ id?: string; error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  if (!title.trim()) return { error: 'Title is required.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('solo_sessions')
    .insert({ title: title.trim() })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: data.id }
}

// ponytail: mesmo contrato de lancarContagem (payload + convert_count) para reusar o CountForm
export async function lancarSoloContagem(
  sessionId: string,
  payload: LancarContagemPayload,
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
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.user_metadata?.role !== 'admin') return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: item, error: itemError } = await admin
    .from('inventory_items')
    .select('bpu, pallet_size, brand_name')
    .eq('brand_code', payload.brand_code)
    .single()

  if (itemError || !item) return { error: 'Item not found.' }
  if (!item.bpu) return { error: 'Item has incomplete data — please contact the admin.' }

  const { data: converted, error: convError } = await admin.rpc('convert_count', {
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

  const { error } = await admin.from('solo_entries').upsert(
    {
      session_id: sessionId,
      brand_code: payload.brand_code,
      brand_name: item.brand_name,
      pallets: payload.pallets,
      cases: payload.cases,
      units: payload.units,
      final_cases,
      final_units,
      is_weight_count: payload.is_weight_count ?? false,
      counted_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,brand_code' },
  )
  if (error) return { error: `Error saving: ${error.message}` }

  return { final_cases, final_units, brand_name: item.brand_name }
}

export async function encerrarSoloSessao(sessionId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin.from('solo_sessions').update({ status: 'closed' }).eq('id', sessionId)
  if (error) return { error: error.message }
  return {}
}
