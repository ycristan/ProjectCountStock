'use client'

import { useState } from 'react'
import { createTeamSetup } from '@/actions/team-setup'
import type { TeamDraft } from '@/lib/team-setup-types'
import type { Credencial } from '@/actions/sessao'
import { LoginCards } from './LoginCards'

export function TeamSetupForm({ sessionId, numberOfTeams, savedDraft, credentials }: {
  sessionId: string; numberOfTeams: number; savedDraft?: TeamDraft[]; credentials?: Credencial[]
}) {
  const [teams, setTeams] = useState<TeamDraft[]>(() => savedDraft ?? Array.from({ length: numberOfTeams }, (_, i) => ({
    name: 'Team ' + (i + 1), members: [{ name: '', role: 'counter' }, { name: '', role: 'counter' }, { name: '', role: 'independent' }],
  })))
  const [cards, setCards] = useState(credentials)
  const [locked, setLocked] = useState(!!savedDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const edit = (index: number, team: TeamDraft) => setTeams(old => old.map((t, i) => i === index ? team : t))

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await createTeamSetup(sessionId, teams)
      if (result.draft) { setTeams(result.draft); setLocked(true) }
      if (result.error) setError(result.error)
      if (result.credenciais) setCards(result.credenciais)
    } catch {
      setLocked(true)
      setError('Connection interrupted. Retry with these names, or reload to recover the saved setup.')
    } finally { setBusy(false) }
  }
  if (cards) return <LoginCards credentials={cards} sessionId={sessionId} setupOnly />
  return <div>
    <h2 className="text-xl font-semibold mb-4">Configure Variable Teams</h2>
    <p className="mb-4 text-amber-800">Isolated development setup. Counting is not activated.</p>
    {locked && <p role="status" className="mb-4">Saved setup recovered. Retry resumes the same team codes and personal PINs.</p>}
    <form onSubmit={submit} className="space-y-6">
      {teams.map((team, i) => <fieldset key={i} disabled={busy || locked} className="border border-slate-200 rounded-xl p-4 space-y-3">
        <legend>Team {i + 1} — {team.members.length} members</legend>
        <label className="block">Team Name
          <input name={'team_' + i + '_name'} value={team.name} required className="block border rounded p-2 w-full"
            onChange={e => edit(i, { ...team, name: e.target.value })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {team.members.map((member, j) => <label key={j}>
            {member.role === 'independent' ? 'Independent' : 'Counter ' + (j + 1)}
            <input name={'team_' + i + '_member_' + j} value={member.name} required className="block border rounded p-2 w-full"
              onChange={e => edit(i, { ...team, members: team.members.map((m, k) => k === j ? { ...m, name: e.target.value } : m) })} />
          </label>)}
        </div>
        <button type="button" className="border rounded px-3 py-2" onClick={() => edit(i, {
          ...team, members: [...team.members.slice(0, -1), { name: '', role: 'counter' }, team.members[team.members.length - 1]],
        })}>Add counter</button>
        {team.members.length > 3 && <button type="button" className="border rounded px-3 py-2 ml-2" onClick={() => edit(i, {
          ...team, members: [...team.members.slice(0, -2), team.members[team.members.length - 1]],
        })}>Remove last counter</button>}
      </fieldset>)}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} className="rounded-xl bg-slate-900 text-white px-4 py-3 disabled:opacity-50">
        {busy ? 'Creating teams...' : locked ? 'Resume Team Setup' : 'Create Teams and Generate Logins'}
      </button>
    </form>
  </div>
}
