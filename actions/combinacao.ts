'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/authorization'

export async function combinarSessao(sessionId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('combine_session_results', { p_session_id: sessionId })
  return error ? { error: error.message } : {}
}
