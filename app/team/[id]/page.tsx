import { notFound } from 'next/navigation'
import Link from 'next/link'
import { readTeamCount } from '@/actions/team-count'
import { TeamCountClient } from './TeamCountClient'

export default async function TeamCountPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') notFound()
  const { id } = await params
  const state = await readTeamCount(id)
  return <main className="max-w-5xl mx-auto p-6">
    <Link href="/team">← Your teams</Link>
    {state ? <TeamCountClient initial={state} /> : <p role="alert">Team access unavailable. Refresh or sign in again.</p>}
  </main>
}
