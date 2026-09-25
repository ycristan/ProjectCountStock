import { notFound } from 'next/navigation'
import { getTeamFlowContexts } from '@/lib/team-flow-context'
import { logout } from '@/actions/auth'

export default async function TeamPage() {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') notFound()
  const context = await getTeamFlowContexts()
  return <main className="max-w-3xl mx-auto p-6">
    <h1 className="text-2xl font-semibold mb-4">Your team access</h1>
    {!context.ok ? <p role="alert">Team access is unavailable. Please retry.</p>
      : context.teams.length === 0 ? <p>No active team membership.</p>
      : context.teams.map(team => <section key={team.membershipId} className="border rounded-xl p-4 mb-4">
        <h2>{team.teamName} — {team.warehouseName}</h2>
        <p>{team.displayName} — {team.role === 'independent' ? 'Independent' : 'Counter ' + team.displayOrder}</p>
        <p>Setup saved. Counting is not activated in this development block.</p>
      </section>)}
    <form action={logout}><button className="border rounded p-2">Log out</button></form>
  </main>
}
