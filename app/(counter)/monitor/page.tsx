import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { MonitorClient } from './_components/MonitorClient'

export default async function MonitorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user?.user_metadata?.counter_role !== 'independente') {
    redirect('/busca')
  }

  const teamId = user.user_metadata?.team_id as string
  const admin = createAdminClient()

  const [{ data: entries }, { data: inventory }, { data: counters }] = await Promise.all([
    admin
      .from('count_entries')
      .select('brand_code, counter_role, final_cases, final_units')
      .eq('team_id', teamId)
      .in('counter_role', ['contador_1', 'contador_2'])
      .eq('is_joint_recount', false),
    admin
      .from('inventory_items')
      .select('brand_code, brand_name')
      .order('brand_code', { ascending: true }),
    admin
      .from('counter_accounts')
      .select('role, finalized_at')
      .eq('team_id', teamId)
      .in('role', ['contador_1', 'contador_2']),
  ])

  return (
    <MonitorClient
      teamId={teamId}
      initialEntries={entries ?? []}
      inventory={inventory ?? []}
      counters={counters ?? []}
    />
  )
}
