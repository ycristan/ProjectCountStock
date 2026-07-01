'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

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

export async function lancarSoloContagem(
  sessionId: string,
  brand_code: string,
  brand_name: string,
  final_cases: number,
  final_units: number,
): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { error } = await admin.from('solo_entries').upsert(
    { session_id: sessionId, brand_code, brand_name, final_cases, final_units, counted_at: new Date().toISOString() },
    { onConflict: 'session_id,brand_code' },
  )
  if (error) return { error: error.message }
  return {}
}

export async function encerrarSoloSessao(sessionId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin.from('solo_sessions').update({ status: 'closed' }).eq('id', sessionId)
  if (error) return { error: error.message }
  return {}
}
