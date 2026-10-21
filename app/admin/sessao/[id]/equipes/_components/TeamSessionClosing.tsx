'use client'

import { useState, useTransition } from 'react'
import { closeTeamSession, readTeamSessionClosing, type TeamSessionClosing as Closing } from '@/actions/team-session'

// R13 (2026-10-07): uncounted actives mean not found. The admin acknowledges the
// list once; the list is ordered by BIN so a whole forgotten aisle stands out.
export function TeamSessionClosing({ sessionId, initial }: { sessionId: string; initial: Closing }) {
  const [state, setState] = useState(initial)
  const [notice, setNotice] = useState('')
  const [pending, startTransition] = useTransition()
  const refresh = async () => { const next = await readTeamSessionClosing(sessionId); if (next) setState(next) }

  return <section className="mt-6 space-y-3 border rounded-xl p-4" data-closing={state.closed ? 'closed' : state.ready ? 'ready' : 'waiting'}>
    <h2 className="font-semibold">Close the count</h2>
    <ul className="text-sm">{state.teams.map(t => <li key={t.teamId}>{t.name}: {t.phase === 'closed' ? 'Closed' : t.phase ?? 'Legacy team'}</li>)}</ul>
    {notice && <p role="status">{notice}</p>}
    {!state.closed && !state.ready && <p>The count can be closed when every team has signed.</p>}
    {state.ready && <>
      <p>{state.uncounted.length === 0 ? 'Every active product was counted by a team.'
        : state.uncounted.length + ' active product(s) were not counted by any team. They will be 0 and marked "Not counted".'}</p>
      {state.uncounted.length > 0 && <table className="w-full text-sm border-collapse">
        <thead><tr><th className="border p-2">BIN</th><th className="border p-2">Product</th></tr></thead>
        <tbody>{state.uncounted.map(u => <tr key={u.brandCode} data-uncounted={u.brandCode}>
          <td className="border p-2">{u.bins.join(', ') || '—'}</td>
          <td className="border p-2">{u.brandCode} — {u.brandName}</td>
        </tr>)}</tbody>
      </table>}
      <button disabled={pending} className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold disabled:opacity-40"
        onClick={() => {
          if (!window.confirm('Acknowledge the list and close the count? Results will be frozen.')) return
          startTransition(async () => {
            const result = await closeTeamSession(sessionId, state.uncounted.map(u => u.brandCode))
            setNotice(result.error ?? 'Count closed.')
            await refresh()
          })
        }}>Acknowledge and close the count</button>
    </>}
    {state.closed && <div className="space-y-2">
      <p>Closed on {new Date(state.closed.acknowledgedAt).toLocaleString()} — {state.closed.uncountedCount} product(s) not counted.</p>
      <a className="block underline" href={'/api/sessao/' + sessionId + '/team-export'}>Download final Excel</a>
    </div>}
    <a className="block underline" href={'/api/sessao/' + sessionId + '/audit-export'}>Download Audit Count</a>
  </section>
}
