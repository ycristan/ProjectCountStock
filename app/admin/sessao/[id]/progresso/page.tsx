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
      />
    )
  }

  const { data: accounts } = await admin
    .from('counter_accounts')
    .select('id, team_id, role, finalized_at')
    .in('team_id', teamIds)

  const { data: entries } = await supabase
    .from('count_entries')
    .select('team_id, counter_role')
    .in('team_id', teamIds)

  // Buscar full_name dos contadores via auth.admin
  const { data: { users: authUsers } = { users: [] } } = await admin.auth.admin.listUsers({
    perPage: 1000,
  })

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

  return (
    <ProgressoClient
      sessionId={sessionId}
      sessionStatus={session?.status ?? 'aberta'}
      sessionCreatedAt={session?.created_at ?? ''}
      teams={teamData}
    />
  )
}
