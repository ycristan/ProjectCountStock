import { createClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/authorization'
import { getTeamFlowContexts } from '@/lib/team-flow-context'
import { AppHeader, NavLink } from '@/components/ui'

// Same header as every signed-in area: the person always sees who is signed in,
// in which role and team.
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = await isAdmin()
  const context = admin ? null : await getTeamFlowContexts()
  const team = context?.ok && context.teams.length === 1 ? context.teams[0] : null
  const name = team?.displayName ?? user?.user_metadata?.full_name ?? (admin ? user?.email?.split('@')[0] : null) ?? 'Counter'
  const detail = admin ? 'Admin'
    : team ? (team.role === 'independent' ? 'Independent' : 'Counter ' + team.displayOrder) + ' · ' + team.teamName
    : undefined

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader name={name} detail={detail} area={admin ? 'Admin' : undefined}
        nav={admin ? <NavLink href="/admin">Admin home</NavLink> : undefined} />
      {children}
    </div>
  )
}
