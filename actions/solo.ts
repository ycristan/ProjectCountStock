'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

export async function criarSoloSessao(
  title: string,
  counterName: string,
  pin: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.user_metadata?.role !== 'admin') return { error: 'Unauthorized' }
  if (!title.trim() || !pin.trim()) return { error: 'Title and PIN are required.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('solo_sessions')
    .insert({ title: title.trim(), counter_name: counterName.trim() || null, access_pin: pin.trim() })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: data.id }
}

export async function verificarSoloPin(pin: string): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('solo_sessions')
    .select('id')
    .eq('access_pin', pin.trim())
    .eq('status', 'open')
    .maybeSingle()

  if (!data) return { error: 'Invalid PIN or session is closed.' }

  const jar = await cookies()
  jar.set('solo_session_id', data.id, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7 })
  return {}
}

export async function lancarSoloContagem(
  brand_code: string,
  brand_name: string,
  final_cases: number,
  final_units: number,
): Promise<{ error?: string }> {
  const jar = await cookies()
  const session_id = jar.get('solo_session_id')?.value
  if (!session_id) return { error: 'Session expired — please re-enter your PIN.' }

  const admin = createAdminClient()
  const { error } = await admin.from('solo_entries').upsert(
    { session_id, brand_code, brand_name, final_cases, final_units, counted_at: new Date().toISOString() },
    { onConflict: 'session_id,brand_code' },
  )
  if (error) return { error: error.message }
  return {}
}

export async function encerrarSoloSessao(sessionId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.user_metadata?.role !== 'admin') return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { error } = await admin.from('solo_sessions').update({ status: 'closed' }).eq('id', sessionId)
  if (error) return { error: error.message }
  return {}
}
