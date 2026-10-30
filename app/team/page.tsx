import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTeamFlowContexts } from '@/lib/team-flow-context'
import { PHASE_LABEL } from '@/lib/team-count-types'
import { PageTop, Tag, buttonClass } from '@/components/ui'

export default async function TeamPage() {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') notFound()
  const context = await getTeamFlowContexts()
  return <main className="mx-auto max-w-lg px-4 py-5">
    <PageTop title="Your team" />
    {!context.ok ? <p role="alert" className="rounded-[10px] bg-alert px-3 py-2 text-white">Team access is unavailable. Please retry.</p>
      : context.teams.length === 0 ? <p className="text-ink-2">You are not in an active team.</p>
      : context.teams.map(team => <section key={team.membershipId}
          className="mb-3 flex flex-col gap-3 rounded-xl border-2 border-ink bg-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="m-0 font-display text-2xl font-bold uppercase">{team.teamName} — {team.warehouseName}</h2>
          <Tag tone={team.phase === 'setup' ? 'neutral' : 'safety'}>{PHASE_LABEL[team.phase] ?? team.phase}</Tag>
        </div>
        <p className="m-0 text-[15px]">{team.displayName} — {team.role === 'independent' ? 'Independent' : 'Counter ' + team.displayOrder}</p>
        {team.phase === 'setup' && <p className="m-0 text-sm text-ink-2">The admin has not started the count yet. You can open the team and wait there.</p>}
        <Link href={'/team/' + team.teamId} className={buttonClass('primary', 'lg', true) + ' no-underline'}>Open team</Link>
      </section>)}
  </main>
}
