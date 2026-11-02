import { notFound } from 'next/navigation'
import { readTeamCount, readTeamInventory } from '@/actions/team-count'
import { isAdmin } from '@/lib/authorization'
import { createClient } from '@/lib/supabase-server'
import { PageTop } from '@/components/ui'
import { AllTeamsLive } from './_components/AllTeamsLive'

// Every new-flow team of the session in one live table (approved 5b, 30/10).
// Reads each team with the same RPCs and permissions as the team monitor.
export default async function AllTeamsLivePage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true' || !(await isAdmin())) notFound()
  const { id } = await params
  const db = await createClient()
  const { data: teams, error } = await db.from('teams').select('id, team_flows(team_id)').eq('session_id', id).order('team_name')
  const back = { href: '/admin/sessao/' + id + '/equipes', label: 'Session teams' }
  if (error) return <><PageTop back={back} title="Live count" /><p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-white">Teams are unavailable. Please reload.</p></>
  const teamIds = (teams ?? []).filter(t => t.team_flows).map(t => t.id)
  if (!teamIds.length) return <><PageTop back={back} title="Live count" /><p className="m-0 text-[15px] text-ink-2">This session has no teams yet. Create them on the session teams screen.</p></>

  const states = await Promise.all(teamIds.map(readTeamCount))
  // All teams of a session count the same warehouse, so one catalog serves them all;
  // a closed team no longer reads it, so take the first team that still can.
  let inventory = null
  for (const teamId of teamIds) if ((inventory = await readTeamInventory(teamId))) break
  return <AllTeamsLive sessionId={id} teamIds={teamIds} initial={states} inventory={inventory ?? []} />
}
