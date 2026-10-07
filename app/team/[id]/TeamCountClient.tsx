'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { decideTeamFinish, decideTeamItem, readTeamComparison, readTeamCount, readTeamInventory, readTeamReviews, requestTeamFinish, reviewTeamResult, saveTeamCount, saveTeamReconciliation, startTeamCount, submitTeamReconciliation } from '@/actions/team-count'
import { createClient } from '@/lib/supabase-client'
import type { ItemBusca, LancarContagemPayload } from '@/actions/contagem'
import type { TeamComparisonItem, TeamCountState, TeamReview } from '@/lib/team-count-types'
import { BuscaClient } from '@/app/(counter)/busca/_components/BuscaClient'
import { CountForm } from '@/app/(counter)/busca/_components/CountForm'

export function TeamCountClient({ initial, inventory }: { initial: TeamCountState; inventory: ItemBusca[] }) {
  const [state, setState] = useState(initial)
  const [catalog, setCatalog] = useState(inventory)
  const [comparison, setComparison] = useState<TeamComparisonItem[]>([])
  const [reviews, setReviews] = useState<TeamReview[]>([])
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [unavailable, setUnavailable] = useState(false)
  const [notice, setNotice] = useState('')
  const [reconciling, setReconciling] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const command = useRef<{ payload: string; id: string; revision: string | null } | null>(null)
  const submission = useRef<{ revision: string; id: string } | null>(null)
  const review = useRef<{ key: string; id: string } | null>(null)
  // Revision of each own record saved on this screen; never older than the last read.
  const saved = useRef(new Map<string, string>())
  const readSequence = useRef(0)
  const teamId = initial.teamId
  const refresh = useCallback(async () => {
    const sequence = ++readSequence.current
    try {
      const next = await readTeamCount(teamId)
      if (sequence !== readSequence.current) return
      if (!next) { setUnavailable(true); return }
      // Comparison exists only after every finish is accepted, and only for the monitor.
      const compares = next.role !== 'counter' && !['setup', 'counting'].includes(next.phase)
      const [compared, history] = compares
        ? await Promise.all([readTeamComparison(teamId), readTeamReviews(teamId)]) : [[], []]
      if (sequence !== readSequence.current) return
      if (!compared || !history) { setUnavailable(true); return }
      setComparison(compared)
      setReviews(history)
      setState(next)
      setUnavailable(false)
    } catch { if (sequence === readSequence.current) setUnavailable(true) }
  }, [teamId])
  // Inventory is loaded once; reload it only on demand or after a product-changed error.
  const reloadCatalog = useCallback(async () => {
    const next = await readTeamInventory(teamId).catch(() => null)
    if (next) setCatalog(next)
  }, [teamId])

  useEffect(() => {
    const db = createClient()
    let disposed = false
    let running = false
    let again = false
    // Serialise reads: a slow older response cannot overwrite a newer snapshot.
    const reload = async () => {
      if (running) { again = true; return }
      running = true
      do {
        again = false
        if (!disposed) await refresh()
      } while (again && !disposed)
      running = false
    }
    const channel = db.channel('team-count-' + teamId)
    for (const table of ['team_count_records', 'team_flows', 'team_memberships', 'team_item_decisions', 'team_reconciliations', 'team_admin_reviews'])
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: 'team_id=eq.' + teamId }, reload)
    void db.auth.getSession().then(({ data }) => {
      if (disposed) return
      void db.realtime.setAuth(data.session?.access_token).then(() => {
        if (!disposed) channel.subscribe(status => {
          if (status === 'SUBSCRIBED') void reload()
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setUnavailable(true)
        })
      })
    })
    // Fallback recovers missed events, including access revocation filtered by RLS.
    const timer = window.setInterval(reload, 15000)
    window.addEventListener('online', reload)
    window.addEventListener('focus', reload)
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener('online', reload)
      window.removeEventListener('focus', reload)
      void db.removeChannel(channel)
    }
  }, [teamId, refresh])

  const canCount = !unavailable && state.role === 'counter' && state.phase === 'counting' && state.finishState === 'counting'
  const own = new Map(state.records.filter(r => r.membershipId === state.membershipId).map(r => [r.brandCode, r]))
  const items = catalog.map(item => {
    const record = own.get(item.brand_code)
    return { ...item, jaContado: !!record, entryExistente: record
      ? { pallets: record.pallets, cases: record.cases, units: record.units } : null }
  })
  const bpu = new Map(catalog.map(item => [item.brand_code, item.bpu]))
  const monitor = state.role !== 'counter'
  const counters = state.members.filter(m => m.role === 'counter')
  const records = new Map(state.records.map(r => [r.brandCode + ':' + r.membershipId, r]))
  const counted = new Set(state.records.map(r => r.brandCode))
  // Display rule: always cases+units, no labels.
  const format = (quantity: string, brand: string) => {
    const q = Number(quantity), b = bpu.get(brand) || 1
    return Math.floor(q / b) + '+' + (q % b)
  }

  async function submit(payload: LancarContagemPayload) {
    const item = catalog.find(i => i.brand_code === payload.brand_code)
    if (!item || !canCount) return { error: 'Counting is blocked. Refresh your team.' }
    // A retry of the same count reuses its command and revision, even if a refresh
    // already brought the saved result: the database then returns the original receipt.
    const fingerprint = JSON.stringify(payload)
    if (command.current?.payload !== fingerprint) {
      const known = [own.get(item.brand_code)?.revision, saved.current.get(item.brand_code)]
        .filter((r): r is string => r != null).map(BigInt)
      const revision = known.length ? known.reduce((a, b) => (a > b ? a : b)).toString() : null
      command.current = { payload: fingerprint, id: crypto.randomUUID(), revision }
    }
    try {
      const result = await saveTeamCount(teamId, command.current.id, command.current.revision, item, payload)
      if (result.error) { void reloadCatalog(); return result }
      command.current = null
      const next = (result as { revision?: string }).revision
      if (next) saved.current.set(item.brand_code, next)
      void refresh()
      return result
    } catch {
      return { error: 'Response unavailable. Retry the same count to confirm it safely.' }
    }
  }

  // Same retry rule as counts: one command and one team revision per reconciled quantity.
  async function reconcile(payload: LancarContagemPayload) {
    const item = catalog.find(i => i.brand_code === payload.brand_code)
    if (!item || state.role !== 'independent' || state.phase !== 'reconciling') return { error: 'Reconciliation is blocked. Refresh your team.' }
    const fingerprint = 'reconcile:' + JSON.stringify(payload)
    if (command.current?.payload !== fingerprint)
      command.current = { payload: fingerprint, id: crypto.randomUUID(), revision: state.revision }
    try {
      const result = await saveTeamReconciliation(teamId, command.current.id, command.current.revision!, item, payload)
      if (result.error) { void reloadCatalog(); return result }
      command.current = null
      void refresh()
      return result
    } catch {
      return { error: 'Response unavailable. Retry the same count to confirm it safely.' }
    }
  }

  function finish(action: () => Promise<{ error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action()
      setNotice(result.error ?? done)
      await refresh()
    })
  }
  const statusLabel: Record<string, string> = {
    counting: 'Counting', requested: 'Waiting for the Independent', accepted: 'Accepted',
  }

  // R07: during a recount round only the products the admin returned take a new value.
  const openRound = comparison.some(row => row.selected)
  const reconcilable = (row: TeamComparisonItem) =>
    row.status === 'reconcile' || (row.status === 'tolerance' && row.decision?.decision === 'reconcile')
  const needsReconciliation = (row: TeamComparisonItem) => openRound ? row.selected : reconcilable(row)
  const resolved = (row: TeamComparisonItem) => row.recounts > 0 ? !!row.reconciliation
    : row.status === 'equal' || (row.status === 'tolerance' && row.decision?.decision === 'accept_value')
    || (reconcilable(row) && !!row.reconciliation)
  const reviewing = !unavailable && state.role === 'admin' && state.phase === 'admin_review'
  function decide(accept: boolean) {
    const brands = accept ? [] : [...selection].sort()
    const question = accept ? 'Accept this team result? Signature collection starts next.'
      : 'Return ' + brands.length + ' product(s) to the Independent for recount?'
    if (!window.confirm(question)) return
    // A retry of the same decision reuses its command; the database returns the original receipt.
    const key = state.revision + ':' + accept + ':' + brands.join(',')
    if (review.current?.key !== key) review.current = { key, id: crypto.randomUUID() }
    const id = review.current.id
    finish(async () => {
      const result = await reviewTeamResult(teamId, state.revision, id, accept, brands)
      if (!result.error) setSelection(new Set())
      return result
    }, accept ? 'Result accepted. Signature collection is next.' : 'Returned for recount: ' + brands.join(', ') + '.')
  }
  const pendingItems = comparison.filter(row => !resolved(row)).length
  const canReconcile = !unavailable && state.role === 'independent' && state.phase === 'reconciling'
  const reconcilingRow = canReconcile ? comparison.find(row => row.brandCode === reconciling && needsReconciliation(row)) : undefined
  const reconcilingItem = reconcilingRow && catalog.find(i => i.brand_code === reconcilingRow.brandCode)

  if (reconcilingRow && reconcilingItem) {
    const previous = reconcilingRow.reconciliation
    return <section className="mt-4 space-y-4">
      <h1 className="text-xl font-semibold">{state.teamName} — Reconciliation</h1>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Original counts</div>
        {reconcilingRow.cells.map(cell => {
          const member = counters.find(m => m.id === cell.membershipId)
          return <div key={cell.membershipId} className="flex justify-between text-sm">
            <span>Counter {member?.order} — {member?.name}</span>
            <span className="font-semibold">{cell.quantity == null ? 'Not counted'
              : format(cell.quantity, reconcilingRow.brandCode) + (cell.method === 'weight' ? ' (weight)' : '')}</span>
          </div>
        })}
      </div>
      <CountForm item={{ ...reconcilingItem, jaContado: !!previous,
          entryExistente: previous ? { pallets: previous.pallets, cases: previous.cases, units: previous.units } : null }}
        onSubmit={reconcile} onVoltar={() => setReconciling(null)}
        onSucesso={result => {
          setReconciling(null)
          setNotice('Reconciled ' + reconcilingRow.brandCode + ': ' + result.final_cases + '+' + result.final_units + '.')
        }} />
    </section>
  }

  return <section className="mt-4 space-y-4">
    <h1 className="text-xl font-semibold">{state.teamName} — {state.warehouseName}</h1>
    <p>{state.role === 'counter' ? 'Blind count — only your quantities are shown.' : 'Team monitor — product consultation only.'}</p>
    <p>Phase: {state.phase}</p>
    {state.role === 'counter' && <p>Your count status: {statusLabel[state.finishState ?? ''] ?? state.finishState}</p>}
    {unavailable && <p role="alert">Connection or access unavailable. Counts are blocked until refreshed.</p>}
    {notice && <p role="status">{notice}</p>}
    <button className="border rounded px-3 py-2" onClick={() => { void refresh(); void reloadCatalog() }}>Refresh team</button>
    {state.role === 'admin' && state.phase === 'setup' && <button disabled={pending || unavailable}
      className="bg-slate-900 text-white rounded px-3 py-2" onClick={() => startTransition(async () => {
        const result = await startTeamCount(teamId, state.revision)
        setNotice(result.error ?? 'Counting started.')
        await refresh()
      })}>{pending ? 'Starting...' : 'Start team counting'}</button>}
    {state.role === 'counter' && canCount && state.membershipId && <button disabled={pending}
      className="w-full bg-white border border-slate-300 rounded-xl py-3 font-semibold"
      onClick={() => {
        if (!window.confirm('Finish your count? You will not be able to add or edit counts unless the Independent rejects it.')) return
        const membershipId = state.membershipId!
        finish(() => requestTeamFinish(teamId, membershipId, state.revision, crypto.randomUUID()),
          'Finish requested. Waiting for the Independent.')
      }}>Finish my count</button>}
    {monitor && !unavailable && state.phase === 'counting' && <div className="space-y-2">
      <h2 className="font-semibold">Counters</h2>
      {counters.map(m => <div key={m.id} data-member={m.order}
        className="flex items-center justify-between border rounded-xl px-3 py-2">
        <span>Counter {m.order} — {m.name}: {statusLabel[m.finishState] ?? m.finishState}</span>
        {state.role === 'independent' && m.finishState === 'requested' && <span className="flex gap-2">
          <button disabled={pending} className="bg-slate-900 text-white rounded px-3 py-2"
            onClick={() => finish(() => decideTeamFinish(teamId, m.id, true, state.revision, crypto.randomUUID()),
              'Finish accepted: ' + m.name + '.')}>Accept</button>
          <button disabled={pending} className="border rounded px-3 py-2"
            onClick={() => finish(() => decideTeamFinish(teamId, m.id, false, state.revision, crypto.randomUUID()),
              'Finish rejected: ' + m.name + ' can count again.')}>Reject</button>
        </span>}
      </div>)}
    </div>}
    {state.phase !== 'setup' && <BuscaClient key={canCount ? 'count' : 'consult'}
      items={items} readOnly={!canCount} onSubmit={submit} />}
    {monitor && !unavailable && !['setup', 'counting'].includes(state.phase) && <div className="overflow-x-auto">
      <h2 className="font-semibold mb-2">Comparison</h2>
      <table className="w-full text-sm border-collapse">
        <thead><tr><th className="border p-2">Product</th>
          {counters.map(m => <th key={m.id} className="border p-2">Counter {m.order} — {m.name}</th>)}
          <th className="border p-2">Result</th>
          {reviewing && <th className="border p-2">Recount</th>}</tr></thead>
        <tbody>{comparison.map(row => {
          const item = catalog.find(i => i.brand_code === row.brandCode)
          const decided = row.decision
          const result = row.recounts > 0
            ? (row.reconciliation ? 'Recounted ' + format(row.reconciliation.quantity, row.brandCode) : 'Recount requested')
            : row.status === 'equal' ? 'Equal'
            : row.status === 'tolerance' && decided?.decision === 'accept_value' ? 'Using ' + format(decided.quantity!, row.brandCode)
            : row.status === 'tolerance' && !decided ? 'Within weight tolerance'
            : row.reconciliation ? 'Reconciled ' + format(row.reconciliation.quantity, row.brandCode)
            : 'Needs reconciliation'
          const choosing = row.status === 'tolerance' && !decided && !openRound && state.role === 'independent' && state.phase === 'reconciling'
          return <tr key={row.brandCode} data-brand={row.brandCode} data-result={result}>
            <td className="border p-2">{row.brandCode} — {item?.brand_name}</td>
            {row.cells.map(cell => <td key={cell.membershipId} className="border p-2">
              {cell.quantity == null ? 'Not counted' : format(cell.quantity, row.brandCode)}
            </td>)}
            <td className="border p-2">{result}
              {choosing && <span className="flex flex-wrap gap-2 mt-1">
                {row.cells.filter((c, i, all) => all.findIndex(o => o.quantity === c.quantity) === i).map(cell =>
                  <button key={cell.recordId} disabled={pending} className="bg-slate-900 text-white rounded px-3 py-2"
                    onClick={() => finish(() => decideTeamItem(teamId, row.brandCode, cell.recordId, state.revision, crypto.randomUUID()),
                      'Using ' + format(cell.quantity!, row.brandCode) + ' for ' + row.brandCode + '.')}>
                    Use {format(cell.quantity!, row.brandCode)}</button>)}
                <button disabled={pending} className="border rounded px-3 py-2"
                  onClick={() => finish(() => decideTeamItem(teamId, row.brandCode, null, state.revision, crypto.randomUUID()),
                    row.brandCode + ' sent to reconciliation.')}>Reconcile</button>
              </span>}
              {canReconcile && needsReconciliation(row) && <button disabled={pending}
                className="block mt-1 bg-slate-900 text-white rounded px-3 py-2"
                onClick={() => { setNotice(''); setReconciling(row.brandCode) }}>
                {row.reconciliation ? 'Edit reconciled count' : 'Enter reconciled count'}</button>}
            </td>
            {reviewing && <td className="border p-2 text-center">
              <input type="checkbox" aria-label={'Recount ' + row.brandCode} disabled={pending}
                checked={selection.has(row.brandCode)} onChange={event => setSelection(current => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(row.brandCode); else next.delete(row.brandCode)
                  return next
                })} />
            </td>}
          </tr>
        })}</tbody>
      </table>
      {canReconcile && comparison.length > 0 && <div className="mt-3 space-y-2">
        <p>{pendingItems === 0 ? 'Every item is resolved.' : pendingItems + ' item(s) still need a decision or reconciled count.'}</p>
        <button disabled={pending || pendingItems > 0} className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold disabled:opacity-40"
          onClick={() => {
            if (!window.confirm('Submit the team result to the admin? Reconciliation will be closed for this team.')) return
            if (submission.current?.revision !== state.revision)
              submission.current = { revision: state.revision, id: crypto.randomUUID() }
            const { revision, id } = submission.current
            finish(() => submitTeamReconciliation(teamId, revision, id), 'Submitted to the admin for review.')
          }}>Submit to admin</button>
      </div>}
      {canReconcile && openRound && <p className="mt-3">Recount round: only the products returned by the admin can be recounted. Other results are kept.</p>}
      {state.phase === 'admin_review' && state.role !== 'admin' && <p className="mt-3">Waiting for admin review. The submitted result is sealed.</p>}
      {reviewing && comparison.length > 0 && <div className="mt-3 space-y-2">
        <p>Accept the sealed result, or select the products the Independent must recount.</p>
        <button disabled={pending} className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold disabled:opacity-40"
          onClick={() => decide(true)}>Accept result</button>
        <button disabled={pending || selection.size === 0} className="w-full bg-white border border-slate-300 rounded-xl py-3 font-semibold disabled:opacity-40"
          onClick={() => decide(false)}>{'Return ' + (selection.size ? selection.size + ' ' : '') + 'selected for recount'}</button>
      </div>}
      {state.phase === 'signing' && <p className="mt-3">Result accepted by the admin. Signature collection is next.</p>}
      {reviews.length > 0 && <div className="mt-3">
        <h2 className="font-semibold mb-1">Admin review history</h2>
        <ul className="text-sm space-y-1">{reviews.map(r => <li key={r.id}>
          {new Date(r.decidedAt).toLocaleString()} — {r.decision === 'accept' ? 'Result accepted'
            : 'Round ' + r.round + ': returned ' + r.brands.join(', ')}
        </li>)}</ul>
      </div>}
    </div>}
    {monitor && !unavailable && state.phase === 'counting' && <div className="overflow-x-auto">
      <h2 className="font-semibold mb-2">Provisional counts — not a reconciled result</h2>
      <table className="w-full text-sm border-collapse">
        <thead><tr><th className="border p-2">Product</th>
          {counters.map(m => <th key={m.id} className="border p-2">Counter {m.order} — {m.name}</th>)}
          <th className="border p-2">Status</th></tr></thead>
        <tbody>{catalog.filter(i => counted.has(i.brand_code)).map(item => {
          const values = counters.map(m => records.get(item.brand_code + ':' + m.id))
          return <tr key={item.brand_code} data-brand={item.brand_code}>
            <td className="border p-2">{item.brand_code} — {item.brand_name}</td>
            {values.map((r, index) => <td key={counters[index].id} className="border p-2">
              {r ? format(r.quantity, item.brand_code) : 'Not counted'}
            </td>)}
            <td className="border p-2">{values.some(r => !r) ? 'Pending counts'
              : new Set(values.map(r => r!.quantity)).size === 1 ? 'Equal' : 'Provisional difference'}</td>
          </tr>
        })}</tbody>
      </table>
    </div>}
  </section>
}
