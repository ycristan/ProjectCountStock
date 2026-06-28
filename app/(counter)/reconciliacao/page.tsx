import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { listarDiscrepancias } from '@/actions/reconciliacao'
import { ReconciliacaoCounterClient } from './_components/ReconciliacaoCounterClient'

export default async function ReconciliacaoCounterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.counter_role !== 'independente') redirect('/busca')

  const items = await listarDiscrepancias()
  return <ReconciliacaoCounterClient items={items} />
}
