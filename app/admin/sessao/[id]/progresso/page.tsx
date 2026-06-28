import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ProgressoClient } from './_components/ProgressoClient'

type Counter = {
  id: string
  role: string
  full_name: string | null
  finalized_at: string | null
  entry_count: number
}

type TeamData = {
  id: string
  team_name: string
  status: string
  counters: Counter[]
}

export default async function ProgressoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: sessionId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: session } = await supabase
    .from('count_sessions')
    .select('id, created_at, status')
    .eq('id', sessionId)
    .single()

  const { data: teams } = await supabase
    .from('teams')
    .select('id, team_name, status')
    .eq('session_id', sessionId)
    .order('team_name')

  const teamIds = (teams ?? []).map((t) => t.id)

  if (teamIds.length === 0) {
    return (
      <ProgressoClient
        sessionId={sessionId}
        sessionStatus={session?.status ?? 'aberta'}
        sessionCreatedAt={session?.created_at ?? ''}
        teams={[]}
        initialEntries={[]}
        initialReconc={[]}
        invMap={{}}
      />
    )
  }

  const [
    { data: accounts },
    { data: entries },
    { data: reconcItems },
    { data: { users: authUsers } = { users: [] } },
  ] = await Promise.all([
    admin.from('counter_accounts').select('id, team_id, role, finalized_at').in('team_id', teamIds),
    admin
      .from('count_entries')
      .select('team_id, counter_role, brand_code, final_cases, final_units')
      .in('team_id', teamIds)
      .eq('is_joint_recount', false),
    admin
      .from('reconciliation_items')
      .select(
        'team_id, brand_code, bin_location, status, reconciliated_cases, reconciliated_units, independente_cases, independente_units',
      )
      .in('team_id', teamIds),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const nameMap: Record<string, string> = {}
  for (const u of authUsers) {
    const tid = u.user_metadata?.team_id
    const role = u.user_metadata?.counter_role
    const name = u.user_metadata?.full_name
    if (tid && role && name) nameMap[`${tid}:${role}`] = name
  }

  const entryCountMap: Record<string, number> = {}
  for (const e of entries ?? []) {
    const key = `${e.team_id}:${e.counter_role}`
    entryCountMap[key] = (entryCountMap[key] ?? 0) + 1
  }

  const teamData: TeamData[] = (teams ?? []).map((t) => ({
    id: t.id,
    team_name: t.team_name,
    status: t.status,
    counters: (accounts ?? [])
      .filter((a) => a.team_id === t.id)
      .map((a) => ({
        id: a.id,
        role: a.role,
        full_name: nameMap[`${t.id}:${a.role}`] ?? null,
        finalized_at: a.finalized_at,
        entry_count: entryCountMap[`${t.id}:${a.role}`] ?? 0,
      }))
      .sort((a, b) => a.role.localeCompare(b.role)),
  }))

  const allCodes = [...new Set((entries ?? []).map((e) => e.brand_code))]
  const invMap: Record<string, { brand_name: string; bpu: number }> = {}
  if (allCodes.length > 0) {
    const { data: invItems } = await admin
      .from('inventory_items')
      .select('brand_code, brand_name, bpu')
      .in('brand_code', allCodes)
    for (const i of invItems ?? []) {
      invMap[i.brand_code] = { brand_name: i.brand_name, bpu: i.bpu }
    }
  }

  return (
    <ProgressoClient
      sessionId={sessionId}
      sessionStatus={session?.status ?? 'aberta'}
      sessionCreatedAt={session?.created_at ?? ''}
      teams={teamData}
      initialEntries={(entries ?? []).map((e) => ({
        team_id: e.team_id,
        counter_role: e.counter_role,
        brand_code: e.brand_code,
        final_cases: e.final_cases,
        final_units: e.final_units,
      }))}
      initialReconc={(reconcItems ?? []).map((r) => ({
        team_id: r.team_id,
        brand_code: r.brand_code,
        bin_location: r.bin_location,
        status: r.status,
        reconciliated_cases: r.reconciliated_cases,
        reconciliated_units: r.reconciliated_units,
        independente_cases: r.independente_cases,
        independente_units: r.independente_units,
      }))}
      invMap={invMap}
    />
  )
}
