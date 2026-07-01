import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { redirect } from 'next/navigation'
import { CombinacaoClient } from './_components/CombinacaoClient'

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
  independente_confirmed_at: string | null
  counters: Counter[]
}

export default async function CombinacaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: sessionId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (user?.user_metadata?.role !== 'admin') redirect('/login')

  const { data: session } = await supabase
    .from('count_sessions')
    .select('id, created_at, status')
    .eq('id', sessionId)
    .single()

  const { data: teams } = await supabase
    .from('teams')
    .select('id, team_name, status, independente_confirmed_at')
    .eq('session_id', sessionId)
    .order('team_name')

  const teamIds = (teams ?? []).map((t) => t.id)

  if (!teamIds.length) {
    return (
      <CombinacaoClient
        sessionId={sessionId}
        sessionStatus={session?.status ?? 'aberta'}
        sessionCreatedAt={session?.created_at ?? ''}
        teams={[]}
        initialEntries={[]}
        initialReconc={[]}
        inventory={[]}
        isConfirmed={false}
        counters={{}}
      />
    )
  }

  const [
    { data: accounts },
    { data: entries },
    { data: reconcItems },
    { data: { users } },
    { data: existing },
    { data: inventory },
  ] = await Promise.all([
    admin
      .from('counter_accounts')
      .select('id, team_id, role, finalized_at')
      .in('team_id', teamIds),
    admin
      .from('count_entries')
      .select('team_id, counter_role, brand_code, final_cases, final_units')
      .in('team_id', teamIds)
      .eq('is_joint_recount', false),
    admin
      .from('reconciliation_items')
      .select(
        'team_id, brand_code, status, contador_1_cases, contador_1_units, contador_2_cases, contador_2_units, independente_cases, independente_units, reconciliated_cases, reconciliated_units',
      )
      .in('team_id', teamIds),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    supabase
      .from('combined_results')
      .select('brand_code')
      .eq('session_id', sessionId)
      .limit(1),
    // ponytail: fetch all inventory upfront so invMap is always populated,
    // even when admin opens the page before counters submit any entries
    supabase
      .from('inventory_items')
      .select('brand_code, brand_name, bpu, category, category1'),
  ])

  const nameMap: Record<string, string> = {}
  const counters: Record<string, Record<string, string>> = {}
  for (const u of users ?? []) {
    const tid = u.user_metadata?.team_id as string
    const role = u.user_metadata?.counter_role as string
    const name = u.user_metadata?.full_name as string
    if (tid && role && name && teamIds.includes(tid)) {
      nameMap[`${tid}:${role}`] = name
      if (!counters[tid]) counters[tid] = {}
      counters[tid][role] = name
    }
  }

  const entryCountMap: Record<string, number> = {}
  for (const e of entries ?? []) {
    const k = `${e.team_id}:${e.counter_role}`
    entryCountMap[k] = (entryCountMap[k] ?? 0) + 1
  }

  const teamData: TeamData[] = (teams ?? []).map((t) => ({
    id: t.id,
    team_name: t.team_name,
    status: t.status,
    independente_confirmed_at: t.independente_confirmed_at ?? null,
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

  return (
    <CombinacaoClient
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
        status: r.status,
        contador_1_cases: r.contador_1_cases,
        contador_1_units: r.contador_1_units,
        contador_2_cases: r.contador_2_cases,
        contador_2_units: r.contador_2_units,
        independente_cases: r.independente_cases,
        independente_units: r.independente_units,
        reconciliated_cases: r.reconciliated_cases,
        reconciliated_units: r.reconciliated_units,
      }))}
      inventory={inventory ?? []}
      isConfirmed={(existing?.length ?? 0) > 0}
      counters={counters}
    />
  )
}
