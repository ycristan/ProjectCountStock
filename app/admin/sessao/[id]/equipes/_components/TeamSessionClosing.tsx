'use client'

import { useState, useTransition } from 'react'
import { Button, buttonClass, cardClass, tableWrapClass, thClass } from '@/components/ui'
import { closeTeamSession, readTeamSessionClosing, type TeamSessionClosing as Closing } from '@/actions/team-session'

// R13 (2026-10-07): uncounted actives mean not found. The admin acknowledges the
// list once; the list is ordered by BIN so a whole forgotten aisle stands out.
export function TeamSessionClosing({ sessionId, initial }: { sessionId: string; initial: Closing }) {
  const [state, setState] = useState(initial)
  const [notice, setNotice] = useState('')
  const [pending, startTransition] = useTransition()
  const refresh = async () => { const next = await readTeamSessionClosing(sessionId); if (next) setState(next) }

  return <section className={cardClass + ' mt-6 flex flex-col gap-3 p-4'} data-closing={state.closed ? 'closed' : state.ready ? 'ready' : 'waiting'}>
    <h2 className="m-0 font-display text-2xl font-bold uppercase">Close the count</h2>
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">{state.teams.map(t => <li key={t.teamId}><strong>{t.name}</strong>: {t.phase === 'closed' ? 'Closed' : t.phase ?? 'Legacy team'}</li>)}</ul>
    {notice && <p role="status" className="m-0 rounded-md border border-line-2 bg-ground-2 px-3 py-2 text-[15px]">{notice}</p>}
    {!state.closed && !state.ready && <p className="m-0 text-[15px] text-ink-2">The count can be closed when every team has signed.</p>}
    {state.ready && <>
      <p className="m-0 text-[15px]">{state.uncounted.length === 0 ? 'Every active product was counted by a team.'
        : state.uncounted.length + ' active product(s) were not counted by any team. They will be 0 and marked "Not counted".'}</p>
      {state.uncounted.length > 0 && <div className={tableWrapClass}><table className="w-full border-collapse text-sm">
        <thead><tr className="bg-ink text-ground"><th className={thClass}>BIN</th><th className={thClass}>Product</th></tr></thead>
        <tbody>{state.uncounted.map(u => <tr key={u.brandCode} data-uncounted={u.brandCode} className="border-t border-ground-2">
          <td className="px-3 py-2.5 font-mono text-[13px] font-semibold">{u.bins.join(', ') || '—'}</td>
          <td className="px-3 py-2.5">{u.brandCode} — {u.brandName}</td>
        </tr>)}</tbody>
      </table></div>}
      <Button variant="primary" size="lg" full disabled={pending}
        onClick={() => {
          if (!window.confirm('Acknowledge the list and close the count? Results will be frozen.')) return
          startTransition(async () => {
            const result = await closeTeamSession(sessionId, state.uncounted.map(u => u.brandCode))
            setNotice(result.error ?? 'Count closed.')
            await refresh()
          })
        }}>Acknowledge and close the count</Button>
    </>}
    {state.closed && <div className="flex flex-col gap-2">
      <p className="m-0 text-[15px]">Closed on {new Date(state.closed.acknowledgedAt).toLocaleString()} — {state.closed.uncountedCount} product(s) not counted.</p>
      <a className={buttonClass('outline', 'sm') + ' w-fit no-underline'} href={'/api/sessao/' + sessionId + '/team-export'}>Download final Excel</a>
    </div>}
    <a className={buttonClass('quiet', 'sm') + ' w-fit no-underline'} href={'/api/sessao/' + sessionId + '/audit-export'}>Download Audit Count</a>
  </section>
}
