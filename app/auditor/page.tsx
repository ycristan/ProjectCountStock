import { readTeamCount, readTeamInventory } from '@/actions/team-count'
import { readAuditorTeams } from '@/actions/auditor'
import { PageTop } from '@/components/ui'
import { AllTeamsLive } from '@/app/admin/sessao/[id]/ao-vivo/_components/AllTeamsLive'

// The Auditor watches the live count and nothing else. The session comes from their login in
// the database; every read below goes through functions that accept the Auditor read-only.
export default async function AuditorPage() {
  const teams = process.env.TEAM_SETUP_ENABLED === 'true' ? await readAuditorTeams() : null
  if (!teams) return <><PageTop title="Live count" /><p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-white">This access has ended or is unavailable.</p></>
  if (!teams.length) return <><PageTop title="Live count" /><p className="m-0 text-[15px] text-ink-2">This session has no teams yet.</p></>
  const teamIds = teams.map(t => t.id)
  const states = await Promise.all(teamIds.map(readTeamCount))
  let inventory = null
  for (const teamId of teamIds) if ((inventory = await readTeamInventory(teamId))) break
  return <AllTeamsLive sessionId="" teamIds={teamIds} initial={states} inventory={inventory ?? []} readOnly />
}
