'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { decideTeamFinish, decideTeamItem, readLastFinishAction, readTeamComparison, readTeamCount, readTeamInventory, readTeamReviews, requestTeamFinish, reviewTeamResult, saveTeamCount, saveTeamReconciliation, startTeamCount, submitTeamReconciliation } from '@/actions/team-count'
import { createClient } from '@/lib/supabase-client'
import type { ItemBusca, LancarContagemPayload } from '@/actions/contagem'
import type { TeamComparisonItem, TeamCountState, TeamReview, TeamSigning } from '@/lib/team-count-types'
import { BuscaClient } from '@/app/(counter)/busca/_components/BuscaClient'
import { CountForm } from '@/app/(counter)/busca/_components/CountForm'
import { markCounterAbsent, readTeamSigning } from '@/actions/team-signing'
import { SigningPanel } from './SigningPanel'
import { PHASE_LABEL, PHASE_STEPS } from '@/lib/team-count-types'
import { Button, FlagIcon, Label, PageTop, Tag } from '@/components/ui'

export function TeamCountClient({ initial, inventory, back }: {
  initial: TeamCountState; inventory: ItemBusca[]; back: { href: string; label: string }
}) {
  const [state, setState] = useState(initial)
  const [catalog, setCatalog] = useState(inventory)
  const [comparison, setComparison] = useState<TeamComparisonItem[]>([])
  const [reviews, setReviews] = useState<TeamReview[]>([])
  const [signing, setSigning] = useState<TeamSigning | null>(null)
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
  const router = useRouter()
  const phase = useRef(initial.phase)
  // The Independent sent this counter back to counting: their last finish event is a reject.
  const [rejected, setRejected] = useState(false)
  // Products whose count just changed flash once on the monitor; the number restarts the animation.
  const [flash, setFlash] = useState(new Map<string, number>())
  const seen = useRef(new Map(initial.records.map(r => [r.brandCode + ':' + r.membershipId, r.revision])))
  const refresh = useCallback(async () => {
    const sequence = ++readSequence.current
    try {
      const next = await readTeamCount(teamId)
      if (sequence !== readSequence.current) return
      // The last signature closes the team: the server page then shows what comes next.
      if (!next) { setUnavailable(true); if (phase.current === 'signing') router.refresh(); return }
      // Comparison exists only after every finish is accepted, and only for the monitor.
      const compares = next.role !== 'counter' && !['setup', 'counting'].includes(next.phase)
      const [compared, history] = compares
        ? await Promise.all([readTeamComparison(teamId), readTeamReviews(teamId)]) : [[], []]
      // Signature collection is visible to everyone in the team, including counters.
      const collection = next.phase === 'signing' ? await readTeamSigning(teamId) : null
      const lastFinish = next.role === 'counter' && next.phase === 'counting' && next.finishState === 'counting' && next.membershipId
        ? await readLastFinishAction(teamId, next.membershipId) : null
      if (sequence !== readSequence.current) return
      if (!compared || !history || (next.phase === 'signing' && !collection)) { setUnavailable(true); return }
      setComparison(compared)
      setReviews(history)
      setSigning(collection)
      const changed = next.records.filter(r => seen.current.get(r.brandCode + ':' + r.membershipId) !== r.revision).map(r => r.brandCode)
      seen.current = new Map(next.records.map(r => [r.brandCode + ':' + r.membershipId, r.revision]))
      if (changed.length) setFlash(current => {
        const marked = new Map(current)
        for (const brand of changed) marked.set(brand, (marked.get(brand) ?? 0) + 1)
        return marked
      })
      setState(next)
      setUnavailable(false)
      setRejected(lastFinish === 'reject')
      phase.current = next.phase
    } catch { if (sequence === readSequence.current) setUnavailable(true) }
  }, [teamId, router])
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
    for (const table of ['team_count_records', 'team_flows', 'team_memberships', 'team_item_decisions', 'team_reconciliations', 'team_admin_reviews', 'team_confirmations'])
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

  const statusTone: Record<string, 'neutral' | 'info' | 'ok'> = { counting: 'neutral', requested: 'info', accepted: 'ok' }
  const th = 'px-3 py-2.5 text-left font-display text-[13px] font-bold uppercase tracking-[0.08em] whitespace-nowrap'
  const td = 'px-3 py-2.5 align-top'
  const qty = 'font-display text-xl font-bold whitespace-nowrap'
  const tableBox = 'overflow-x-auto rounded-xl border border-line bg-surface'
  const stepIndex = PHASE_STEPS.indexOf(state.phase as typeof PHASE_STEPS[number])
  // One sentence: what is happening and what this person does now.
  const guidance = state.phase === 'setup' ? (state.role === 'admin' ? 'Everyone has their card? Start the count.' : 'Wait: the admin has not started the count yet.')
    : state.phase === 'counting' ? (state.role === 'counter'
        ? state.finishState === 'counting' ? 'Find each product, count it and save. When you are done, tap Finish my count.'
        : state.finishState === 'requested' ? 'You asked to finish. Wait for the Independent to accept.'
        : 'Your count is accepted. Wait for the others.'
      : state.role === 'independent' ? 'Watch the counts. Accept or reject each counter who asks to finish.'
      : 'The team is counting. Counts appear here live.')
    : state.phase === 'reconciling' ? (state.role === 'independent' ? 'Check each product marked in orange, then send the result to the admin.' : 'The Independent is checking the differences.')
    : state.phase === 'admin_review' ? (state.role === 'admin' ? 'Accept the result, or choose products to recount.' : 'The admin is reviewing the result.')
    : state.phase === 'signing' ? 'Counters sign first, the Independent last. Then the admin closes the team.'
    : ''

  if (reconcilingRow && reconcilingItem) {
    const previous = reconcilingRow.reconciliation
    return <section className="mx-auto flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <Label>Original counts</Label>
        {reconcilingRow.cells.map(cell => {
          const member = counters.find(m => m.id === cell.membershipId)
          return <div key={cell.membershipId} className="flex items-center justify-between gap-2">
            <span className="text-[15px]">Counter {member?.order} — {member?.name}</span>
            <span className={cell.quantity == null ? 'text-ink-3' : qty}>{cell.quantity == null ? 'Not counted'
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

  const tally = (() => {
    const rows = catalog.filter(i => counted.has(i.brand_code)).map(item => counters.map(m => records.get(item.brand_code + ':' + m.id)))
    return { equal: rows.filter(v => v.every(Boolean) && new Set(v.map(r => r!.quantity)).size === 1).length,
      different: rows.filter(v => v.every(Boolean) && new Set(v.map(r => r!.quantity)).size > 1).length,
      waiting: rows.filter(v => v.some(r => !r)).length }
  })()

  return <section data-phase={state.phase} className={'mx-auto flex flex-col gap-4 ' + (monitor ? 'max-w-6xl' : 'max-w-lg')}>
    <PageTop back={back} kicker={state.warehouseName} title={state.teamName}
      actions={<Button variant="quiet" size="sm" onClick={() => { void refresh(); void reloadCatalog() }}>Refresh team</Button>} />

    {state.phase !== 'setup' && <ol aria-label="Steps" className="m-0 grid list-none grid-cols-4 gap-1 p-0">
      {PHASE_STEPS.map((step, index) => <li key={step} aria-current={index === stepIndex ? 'step' : undefined} className="flex flex-col gap-1">
        <span className={'h-1 ' + (index <= stepIndex ? 'bg-ink' : 'bg-line')} />
        <span className={'text-[11px] leading-tight ' + (index === stepIndex ? 'font-semibold' : 'text-ink-3')}>{PHASE_LABEL[step]}</span>
      </li>)}
    </ol>}

    {state.role === 'counter' && rejected && state.finishState === 'counting' && <div role="alert"
      className="flex items-start gap-3 rounded-xl bg-alert p-4 text-white">
      <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="shrink-0"><path d="M12 3l10 18H2z" /><path d="M12 10v5" /><path d="M12 18v.5" /></svg>
      <span className="flex flex-col gap-1">
        <strong className="font-display text-lg uppercase tracking-[0.04em]">Finish rejected</strong>
        <span className="text-[15px] leading-snug">Your finish was rejected by the Independent. Check your counts, continue counting and tap &quot;Finish my count&quot; again.</span>
      </span>
    </div>}

    <div className="flex flex-col gap-2 rounded-xl bg-ink p-4 text-ground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-[#C9C6BE]">{PHASE_LABEL[state.phase] ?? state.phase}</Label>
        {state.role === 'counter' && state.finishState && <span data-finish={state.finishState}>
          <Tag tone={statusTone[state.finishState] ?? 'neutral'}>{statusLabel[state.finishState] ?? state.finishState}</Tag></span>}
      </div>
      <p className="m-0 text-[17px] leading-snug font-medium">{guidance}</p>
      {state.role === 'counter' && <p className="m-0 text-[13px] text-[#C9C6BE]">
        Your count status: {statusLabel[state.finishState ?? ''] ?? state.finishState}</p>}
      {state.role === 'counter' && state.phase === 'counting' && <p className="m-0 text-[13px] text-[#C9C6BE]">Blind count: you only see your own quantities.</p>}
    </div>

    {unavailable && <p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-[15px] font-medium text-white">Connection or access unavailable. Counts are blocked until refreshed.</p>}
    {notice && <p role="status" className="m-0 rounded-md border-2 border-ink bg-surface px-3 py-2 text-[15px] font-medium">{notice}</p>}

    {state.role === 'admin' && state.phase === 'setup' && <Button variant="primary" size="lg" full disabled={pending || unavailable}
      onClick={() => startTransition(async () => {
        const result = await startTeamCount(teamId, state.revision)
        setNotice(result.error ?? 'Counting started.')
        await refresh()
      })}>{pending ? 'Starting...' : 'Start team counting'}</Button>}

    {monitor && !unavailable && state.phase === 'counting' && <div className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-lg font-bold uppercase tracking-[0.04em]">Counters</h2>
      <div className="grid gap-2 md:grid-cols-2">
      {counters.map(m => <div key={m.id} data-member={m.order}
        className={'flex flex-wrap items-center gap-2 rounded-md bg-surface p-3 ' + (m.finishState === 'requested' ? 'border-2 border-ink' : 'border border-line')}>
        <span className="flex min-w-0 flex-grow flex-col gap-1">
          <span className="text-[15px] font-semibold">Counter {m.order} — {m.name}</span>
          <span>{m.departed ? <Tag tone="alert">Absent</Tag> : <Tag tone={statusTone[m.finishState] ?? 'neutral'}>{statusLabel[m.finishState] ?? m.finishState}</Tag>}</span>
        </span>
        {state.role === 'independent' && m.finishState === 'requested' && <span className="flex gap-2">
          <Button variant="danger" size="sm" disabled={pending}
            onClick={() => finish(() => decideTeamFinish(teamId, m.id, false, state.revision, crypto.randomUUID()),
              'Finish rejected: ' + m.name + ' can count again.')}>Reject</Button>
          <Button variant="success" size="sm" disabled={pending}
            onClick={() => finish(() => decideTeamFinish(teamId, m.id, true, state.revision, crypto.randomUUID()),
              'Finish accepted: ' + m.name + '.')}>Accept</Button>
        </span>}
        {state.role === 'independent' && !m.departed && m.finishState !== 'accepted' && <Button variant="quiet" size="sm" disabled={pending}
          onClick={() => {
            // R08: a counter who left and will not return; their counts stay valid.
            const reason = window.prompt('Mark ' + m.name + ' as absent? They will lose access. Reason:')?.trim()
            if (reason) finish(() => markCounterAbsent(teamId, m.id, reason, state.revision, crypto.randomUUID()),
              m.name + ' marked absent.')
          }}>Mark absent</Button>}
      </div>)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <span className="flex flex-col items-center rounded-md bg-ok py-2 text-white"><strong className="font-display text-2xl">{tally.equal}</strong><span className="text-xs font-semibold">Equal</span></span>
        <span className="flex flex-col items-center rounded-md bg-diff py-2 text-white"><strong className="font-display text-2xl">{tally.different}</strong><span className="text-xs font-semibold">Different</span></span>
        <span className="flex flex-col items-center rounded-md border border-line bg-surface py-2"><strong className="font-display text-2xl">{tally.waiting}</strong><span className="text-xs font-semibold text-ink-2">Waiting</span></span>
      </div>
    </div>}

    {monitor && !unavailable && state.phase === 'counting' && <div className="flex flex-col gap-2">
      <h2 className="m-0 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-[0.04em]">
        <span aria-hidden="true" className="cs-live size-2.5 rounded-full bg-ok" />Live counts — not a final result</h2>
      <div className={tableBox}>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="bg-ink text-ground"><th className={th}>Product</th>
          {counters.map(m => <th key={m.id} className={th}>C{m.order} · {m.name}</th>)}
          <th className={th}>Status</th></tr></thead>
        <tbody>{catalog.filter(i => counted.has(i.brand_code)).map(item => {
          const values = counters.map(m => records.get(item.brand_code + ':' + m.id))
          const status = values.some(r => !r) ? 'waiting' : new Set(values.map(r => r!.quantity)).size === 1 ? 'equal' : 'different'
          return <tr key={item.brand_code + ':' + (flash.get(item.brand_code) ?? 0)} data-brand={item.brand_code}
            className={'border-t border-ground-2 ' + (flash.has(item.brand_code) ? 'cs-flash ' : '') + (status === 'different' ? 'bg-[#FFF4EC]' : '')}>
            <td className={td}><span className="block font-mono text-xs font-semibold text-ink-2">{item.brand_code}</span>
              <span className="font-semibold">{item.brand_name}</span></td>
            {values.map((r, index) => <td key={counters[index].id} className={td}>
              {r ? <span className={qty + (status === 'different' ? ' text-diff' : '')}>{format(r.quantity, item.brand_code)}</span>
                : <span className="text-ink-3">Not counted</span>}
            </td>)}
            <td className={td}>{status === 'waiting' ? <Tag>Pending counts</Tag>
              : status === 'equal' ? <Tag tone="ok">Equal</Tag> : <Tag tone="diff">Provisional difference</Tag>}</td>
          </tr>
        })}</tbody>
      </table>
      </div>
    </div>}

    {state.phase !== 'setup' && <div className={monitor ? 'mx-auto w-full max-w-lg' : ''}><BuscaClient key={canCount ? 'count' : 'consult'}
      items={items} readOnly={!canCount} onSubmit={submit} /></div>}

    {monitor && !unavailable && !['setup', 'counting'].includes(state.phase) && <div className="flex flex-col gap-3">
      <h2 className="m-0 font-display text-lg font-bold uppercase tracking-[0.04em]">Comparison</h2>
      <div className={tableBox}>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="bg-ink text-ground"><th className={th}>Product</th>
          {counters.map(m => <th key={m.id} className={th}>C{m.order} · {m.name}</th>)}
          <th className={th}>Result</th>
          {reviewing && <th className={th}>Recount</th>}</tr></thead>
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
          const tone = resolved(row) ? 'ok' : row.status === 'tolerance' && !decided ? 'info' : 'diff'
          const choosing = row.status === 'tolerance' && !decided && !openRound && state.role === 'independent' && state.phase === 'reconciling'
          return <tr key={row.brandCode} data-brand={row.brandCode} data-result={result}
            className={'border-t border-ground-2 ' + (tone === 'diff' ? 'bg-[#FFF4EC]' : '')}>
            <td className={td}><span className="block font-mono text-xs font-semibold text-ink-2">{row.brandCode}</span>
              <span className="font-semibold">{item?.brand_name}</span></td>
            {row.cells.map(cell => <td key={cell.membershipId} className={td}>
              {cell.quantity == null ? <span className="text-ink-3">Not counted</span> : <span className={qty}>{format(cell.quantity, row.brandCode)}</span>}
            </td>)}
            <td className={td}><div className="flex flex-col items-start gap-2"><Tag tone={tone}>{result}</Tag>
              {choosing && <span className="flex flex-wrap gap-2">
                {row.cells.filter((c, i, all) => all.findIndex(o => o.quantity === c.quantity) === i).map(cell =>
                  <Button key={cell.recordId} variant="dark" size="sm" disabled={pending}
                    onClick={() => finish(() => decideTeamItem(teamId, row.brandCode, cell.recordId, state.revision, crypto.randomUUID()),
                      'Using ' + format(cell.quantity!, row.brandCode) + ' for ' + row.brandCode + '.')}>
                    Use {format(cell.quantity!, row.brandCode)}</Button>)}
                <Button variant="outline" size="sm" disabled={pending}
                  onClick={() => finish(() => decideTeamItem(teamId, row.brandCode, null, state.revision, crypto.randomUUID()),
                    row.brandCode + ' sent to reconciliation.')}>Reconcile</Button>
              </span>}
              {canReconcile && needsReconciliation(row) && <Button variant="dark" size="sm" disabled={pending}
                onClick={() => { setNotice(''); setReconciling(row.brandCode) }}>
                {row.reconciliation ? 'Edit reconciled count' : 'Enter reconciled count'}</Button>}
            </div></td>
            {reviewing && <td className={td + ' text-center'}>
              <input type="checkbox" aria-label={'Recount ' + row.brandCode} disabled={pending} className="size-6 accent-ink"
                checked={selection.has(row.brandCode)} onChange={event => setSelection(current => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(row.brandCode); else next.delete(row.brandCode)
                  return next
                })} />
            </td>}
          </tr>
        })}</tbody>
      </table>
      </div>
      {canReconcile && comparison.length > 0 && <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-ground px-4 py-3">
        <p className="m-0 text-[15px] font-medium">{pendingItems === 0 ? 'Every item is resolved.' : pendingItems + ' item(s) still need a decision or reconciled count.'}</p>
        <Button variant="primary" size="lg" full disabled={pending || pendingItems > 0}
          onClick={() => {
            if (!window.confirm('Submit the team result to the admin? Reconciliation will be closed for this team.')) return
            if (submission.current?.revision !== state.revision)
              submission.current = { revision: state.revision, id: crypto.randomUUID() }
            const { revision, id } = submission.current
            finish(() => submitTeamReconciliation(teamId, revision, id), 'Submitted to the admin for review.')
          }}>Submit to admin</Button>
      </div>}
      {canReconcile && openRound && <p className="m-0 text-[15px]">Recount round: only the products returned by the admin can be recounted. Other results are kept.</p>}
      {state.phase === 'admin_review' && state.role !== 'admin' && <p className="m-0 text-[15px]">Waiting for admin review. The submitted result is sealed.</p>}
      {reviewing && comparison.length > 0 && <div className="flex flex-col gap-2 md:flex-row">
        <Button variant="primary" size="lg" full disabled={pending} onClick={() => decide(true)}>Accept result</Button>
        <Button variant="outline" size="lg" full disabled={pending || selection.size === 0}
          onClick={() => decide(false)}>{'Return ' + (selection.size ? selection.size + ' ' : '') + 'selected for recount'}</Button>
      </div>}
      {state.phase === 'signing' && !signing && <p className="m-0 text-[15px]">Result accepted by the admin. Signature collection is next.</p>}
      {reviews.length > 0 && <div className="flex flex-col gap-1">
        <Label>Admin review history</Label>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">{reviews.map(r => <li key={r.id}>
          {new Date(r.decidedAt).toLocaleString()} — {r.decision === 'accept' ? 'Result accepted'
            : r.decision === 'cancel_signing' ? 'Signature collection cancelled'
            : 'Round ' + r.round + ': returned ' + r.brands.join(', ')}
        </li>)}</ul>
      </div>}
    </div>}

    {state.phase === 'signing' && signing && !unavailable && <div className="mx-auto w-full max-w-lg"><SigningPanel teamId={teamId} signing={signing}
      isAdmin={state.role === 'admin'} pending={pending} run={finish} /></div>}

    {state.role === 'counter' && canCount && state.membershipId && <div className="sticky bottom-0 -mx-4 border-t border-line bg-ground px-4 py-3">
      <Button variant="primary" size="lg" full disabled={pending}
        onClick={() => {
          if (!window.confirm('Finish your count? You will not be able to add or edit counts unless the Independent rejects it.')) return
          const membershipId = state.membershipId!
          finish(() => requestTeamFinish(teamId, membershipId, state.revision, crypto.randomUUID()),
            'Finish requested. Waiting for the Independent.')
        }}><FlagIcon />Finish my count</Button>
    </div>}
  </section>
}
