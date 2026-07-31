'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import type { LancarContagemPayload, LancarContagemResult } from '@/actions/contagem'
import { sendSoloResultsEmail } from '@/lib/send-solo-results-email'

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.user_metadata?.role === 'admin'
}

async function isSoloCounter(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.user_metadata?.role === 'counter' && user?.user_metadata?.is_solo_counter === true
}

export async function criarSoloSessaoCompleta(input: {
  title: string
  assignedToCounter: boolean
  restrictToList: boolean
  itemCodes: string[]
}): Promise<{ id?: string; error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const title = input.title.trim()
  if (!title) return { error: 'Title is required.' }

  const admin = createAdminClient()
  const { data: settings } = await admin.from('app_settings').select('default_box_tare_g').eq('id', 1).single()
  const box_tare_g = settings?.default_box_tare_g ?? 300

  const { data, error } = await admin
    .from('solo_sessions')
    .insert({
      title,
      assigned_to_counter: input.assignedToCounter,
      restrict_to_list: input.restrictToList,
      box_tare_g,
    })
    .select('id')
    .single()
  if (error || !data) return { error: error?.message ?? 'Error creating session.' }

  if (input.restrictToList && input.itemCodes.length > 0) {
    const { error: itemsError } = await admin
      .from('solo_session_items')
      .insert(input.itemCodes.map((brand_code) => ({ session_id: data.id, brand_code })))
    if (itemsError) return { error: `Session created but failed to save item list: ${itemsError.message}` }
  }

  return { id: data.id }
}

// ponytail: shared by the admin path (lancarSoloContagem) and the counter path
// (lancarSoloContagemCounter) — same validation/convert/save, only the auth check differs
async function _saveSoloEntry(
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

export async function lancarSoloContagem(
  sessionId: string,
  payload: LancarContagemPayload,
): Promise<LancarContagemResult> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  return _saveSoloEntry(sessionId, payload)
}

export async function encerrarSoloSessao(sessionId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin.from('solo_sessions').update({ status: 'closed' }).eq('id', sessionId)
  if (error) return { error: error.message }
  return {}
}

// ─── Assignment (admin) ──────────────────────────────────────────────────────

export async function atribuirSoloContador(
  sessionId: string,
  assigned: boolean,
  restrict: boolean,
): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('solo_sessions')
    .update({ assigned_to_counter: assigned, restrict_to_list: restrict })
    .eq('id', sessionId)
  return error ? { error: error.message } : {}
}

export async function adicionarItemListaSolo(sessionId: string, brandCode: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('solo_session_items')
    .upsert({ session_id: sessionId, brand_code: brandCode }, { onConflict: 'session_id,brand_code' })
  return error ? { error: error.message } : {}
}

export async function removerItemListaSolo(sessionId: string, brandCode: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('solo_session_items')
    .delete()
    .eq('session_id', sessionId)
    .eq('brand_code', brandCode)
  return error ? { error: error.message } : {}
}

// ─── Counter-facing (fixed solo-counter account) ────────────────────────────

export async function listarSoloSessoesAtribuidas(): Promise<{ id: string; title: string; counter_name: string | null }[]> {
  if (!(await isSoloCounter())) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('solo_sessions')
    .select('id, title, counter_name')
    .eq('assigned_to_counter', true)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function definirNomeContadorSolo(sessionId: string, nome: string): Promise<{ error?: string }> {
  if (!(await isSoloCounter())) return { error: 'Unauthorized' }
  if (!nome.trim()) return { error: 'Name is required.' }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('solo_sessions')
    .select('assigned_to_counter, status')
    .eq('id', sessionId)
    .single()
  if (!session || !session.assigned_to_counter || session.status !== 'open') {
    return { error: 'Session not available.' }
  }

  // ponytail: .is('counter_name', null) — only the first person to open the
  // session sets the name; later re-opens by the same shared account don't overwrite it
  const { error } = await admin
    .from('solo_sessions')
    .update({ counter_name: nome.trim() })
    .eq('id', sessionId)
    .is('counter_name', null)
  return error ? { error: error.message } : {}
}

export async function lancarSoloContagemCounter(
  sessionId: string,
  payload: LancarContagemPayload,
): Promise<LancarContagemResult> {
  if (!(await isSoloCounter())) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('solo_sessions')
    .select('assigned_to_counter, status, restrict_to_list')
    .eq('id', sessionId)
    .single()
  if (!session || !session.assigned_to_counter || session.status !== 'open') {
    return { error: 'Session not available.' }
  }

  if (session.restrict_to_list) {
    const { data: allowed } = await admin
      .from('solo_session_items')
      .select('brand_code')
      .eq('session_id', sessionId)
      .eq('brand_code', payload.brand_code)
      .maybeSingle()
    if (!allowed) return { error: 'Item is not in the pre-selected list for this count.' }
  }

  return _saveSoloEntry(sessionId, payload)
}

export async function finalizarSoloContagemCounter(sessionId: string): Promise<{ error?: string }> {
  if (!(await isSoloCounter())) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('solo_sessions')
    .select('assigned_to_counter, status, title, counter_name')
    .eq('id', sessionId)
    .single()
  if (!session || !session.assigned_to_counter || session.status !== 'open') {
    return { error: 'Session not available.' }
  }

  const { error } = await admin.from('solo_sessions').update({ status: 'closed' }).eq('id', sessionId)
  if (error) return { error: error.message }

  const { data: entries } = await admin
    .from('solo_entries')
    .select('brand_code, brand_name, final_cases, final_units')
    .eq('session_id', sessionId)
    .order('brand_code')

  const { data: settings } = await admin.from('app_settings').select('notify_email').eq('id', 1).single()
  if (settings?.notify_email) {
    // ponytail: failure here must never block the finalise — session is already closed above.
    // try/catch is defensive: sendSoloResultsEmail is designed to never throw, but this path
    // must not depend on that guarantee alone.
    try {
      await sendSoloResultsEmail(settings.notify_email, session.title, session.counter_name, entries ?? [])
    } catch (err) {
      console.error('finalizarSoloContagemCounter: email send threw unexpectedly', err)
    }
  }

  return {}
}
