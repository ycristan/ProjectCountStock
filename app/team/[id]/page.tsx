import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { readTeamCount, readTeamInventory } from '@/actions/team-count'
import { isAdmin } from '@/lib/authorization'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { TeamCountClient } from './TeamCountClient'

// A closed team has no screen (R12). The admin goes on to close the session;
// a member is told the count is over instead of being asked to sign in again.
async function closedTeam(teamId: string) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: team } = await admin.from('teams').select('session_id, team_flows(phase)').eq('id', teamId).maybeSingle()
  if ((team?.team_flows as unknown as { phase: string } | null)?.phase !== 'closed') return null
  if (await isAdmin()) redirect('/admin/sessao/' + team!.session_id + '/equipes')
  const { data: member } = await admin.from('team_memberships').select('id').eq('team_id', teamId).eq('user_id', user.id).maybeSingle()
  return member ? 'member' : null
}

export default async function TeamCountPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') notFound()
  const { id } = await params
  const [state, items] = await Promise.all([readTeamCount(id), readTeamInventory(id)])
  const closed = state && items ? null : await closedTeam(id)
  return <main className="max-w-5xl mx-auto p-6">
    <Link href="/team">← Your teams</Link>
    {state && items ? <TeamCountClient initial={state} inventory={items} />
      : closed ? <p role="status" className="mt-4">This team is closed: all signatures were received. Your part of the count is finished.</p>
      : <p role="alert">Team access unavailable. Refresh or sign in again.</p>}
  </main>
}
