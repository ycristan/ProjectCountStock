import { notFound } from 'next/navigation'
import Link from 'next/link'
import { readTeamCount, readTeamInventory } from '@/actions/team-count'
import { TeamCountClient } from './TeamCountClient'

export default async function TeamCountPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') notFound()
  const { id } = await params
  const [state, items] = await Promise.all([readTeamCount(id), readTeamInventory(id)])
  return <main className="max-w-5xl mx-auto p-6">
    <Link href="/team">← Your teams</Link>
    {state && items ? <TeamCountClient initial={state} inventory={items} /> : <p role="alert">Team access unavailable. Refresh or sign in again.</p>}
  </main>
}
