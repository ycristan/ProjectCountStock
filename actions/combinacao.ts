'use server'

import { createAdminClient } from '@/lib/supabase-admin'

export async function combinarSessao(sessionId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase.rpc('combine_session_results', { p_session_id: sessionId })
  if (error) return { error: error.message }
  return {}
}
