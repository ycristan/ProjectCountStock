'use client'

import { useState } from 'react'
import { createTeamSetup } from '@/actions/team-setup'
import type { TeamDraft } from '@/lib/team-setup-types'
import type { Credencial } from '@/actions/sessao'
import { Button, Label, Notice, PageTop, cardClass, inputClass } from '@/components/ui'
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
    <PageTop back={{ href: '/admin/sessoes', label: 'Sessions' }} title="Configure Variable Teams" />
    {locked && <div className="mb-4"><p role="status" className="m-0 rounded-md border border-line-2 bg-ground-2 px-3 py-2 text-[15px]">Saved setup recovered. Retry resumes the same team codes and personal PINs.</p></div>}
    <form onSubmit={submit} className="flex flex-col gap-4">
      {teams.map((team, i) => <fieldset key={i} disabled={busy || locked} className={cardClass + ' m-0 flex flex-col gap-3 p-4'}>
        <legend className="px-1 font-display text-xl font-bold uppercase">Team {i + 1} — {team.members.length} members</legend>
        <label className="flex flex-col gap-1.5"><Label>Team Name</Label>
          <input name={'team_' + i + '_name'} value={team.name} required className={inputClass}
            onChange={e => edit(i, { ...team, name: e.target.value })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {team.members.map((member, j) => <label key={j} className="flex flex-col gap-1.5">
            <Label>{member.role === 'independent' ? 'Independent' : 'Counter ' + (j + 1)}</Label>
            <input name={'team_' + i + '_member_' + j} value={member.name} required placeholder="Full name" className={inputClass}
              onChange={e => edit(i, { ...team, members: team.members.map((m, k) => k === j ? { ...m, name: e.target.value } : m) })} />
          </label>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => edit(i, {
            ...team, members: [...team.members.slice(0, -1), { name: '', role: 'counter' }, team.members[team.members.length - 1]],
          })}>Add counter</Button>
          {team.members.length > 3 && <Button type="button" variant="quiet" size="sm" onClick={() => edit(i, {
            ...team, members: [...team.members.slice(0, -2), team.members[team.members.length - 1]],
          })}>Remove last counter</Button>}
        </div>
      </fieldset>)}
      {error && <Notice>{error}</Notice>}
      <Button type="submit" variant="primary" size="lg" full disabled={busy}>
        {busy ? 'Creating teams...' : locked ? 'Resume Team Setup' : 'Create Teams and Generate Logins'}
      </Button>
    </form>
  </div>
}
