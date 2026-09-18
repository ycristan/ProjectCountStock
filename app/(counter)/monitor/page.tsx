import { redirect } from 'next/navigation'
import { getTeamCounterAccess } from '@/lib/authorization'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import { MonitorClient } from './_components/MonitorClient'

export default async function MonitorPage() {
  const access = await getTeamCounterAccess()
  if (!access || access.counterRole !== 'independente') redirect('/busca')
  const teamId = access.teamId
  const admin = createAdminClient()
  const { data: team } = await admin.from('teams').select('session_id').eq('id', teamId).single()
  if (!team) redirect('/busca')
  const { data: session } = await admin.from('count_sessions').select('warehouse_id').eq('id', team.session_id).single()
  if (!session) redirect('/busca')

  const [{ data: entries }, inventory, { data: counters }, { data: teamData }] =
    await Promise.all([
      admin
        .from('count_entries')
        .select('brand_code, counter_role, final_cases, final_units')
        .eq('team_id', teamId)
        .in('counter_role', ['contador_1', 'contador_2'])
        .eq('is_joint_recount', false),
      fetchAllRows<{ brand_code: string; brand_name: string }>((from, to) =>
        admin
          .from('inventory_items')
          .select('brand_code, brand_name')
          .eq('warehouse_id', session.warehouse_id)
          .order('brand_code', { ascending: true })
          .range(from, to)
      ),
      admin
        .from('counter_accounts')
        .select('id, role, finalized_at')
        .eq('team_id', teamId)
        .in('role', ['contador_1', 'contador_2']),
      admin
        .from('teams')
        .select('independente_confirmed_at')
        .eq('id', teamId)
        .single(),
    ])

  return (
    <MonitorClient
      teamId={teamId}
      initialEntries={entries ?? []}
      inventory={inventory}
      counters={counters ?? []}
      initialIndConfirmed={!!teamData?.independente_confirmed_at}
    />
  )
}
