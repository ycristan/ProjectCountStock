'use client'

import Link from 'next/link'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ItemBusca } from '@/actions/contagem'
import { readTeamComparison, readTeamCount } from '@/actions/team-count'
import { PHASE_LABEL, type TeamComparisonItem, type TeamCountState } from '@/lib/team-count-types'
import { filterItems } from '@/lib/inventory-search'
import { useTeamLive } from '@/lib/use-team-live'
import { PageTop, Tag, buttonClass } from '@/components/ui'
import { Icon } from '@/components/icons'

type Status = 'equal' | 'tolerance' | 'different' | 'reconciled' | 'waiting'
const STATUS: Record<Status, { label: string; tone: 'ok' | 'diff' | 'info' | 'neutral' }> = {
  equal: { label: 'Equal', tone: 'ok' }, tolerance: { label: 'Within tolerance', tone: 'ok' },
  different: { label: 'Different', tone: 'diff' }, reconciled: { label: 'Reconciled', tone: 'info' },
  waiting: { label: 'Waiting 2nd count', tone: 'neutral' },
}
const PHASE_TONE: Record<string, 'safety' | 'info' | 'dark' | 'ok' | 'neutral'> = {
  setup: 'neutral', counting: 'safety', reconciling: 'info', admin_review: 'dark', signing: 'ok', closed: 'ok',
}
// Same display rule as the team monitor: cases+units, no labels.
const format = (quantity: string, bpu: number) => Math.floor(Number(quantity) / (bpu || 1)) + '+' + (Number(quantity) % (bpu || 1))

// Before reconciliation the status comes from the counts themselves; afterwards from the
// team comparison, which also knows weight tolerance and the reconciled value.
function statusOf(quantities: (string | undefined)[], compared: TeamComparisonItem | undefined): Status {
  if (compared) return compared.reconciliation ? 'reconciled' : compared.status === 'reconcile' ? 'different' : compared.status
  if (quantities.some(q => q === undefined)) return 'waiting'
  return quantities.every(q => q === quantities[0]) ? 'equal' : 'different'
}

export function AllTeamsLive({ sessionId, teamIds, initial, inventory }: {
  sessionId: string; teamIds: string[]; initial: (TeamCountState | null)[]; inventory: ItemBusca[]
}) {
  const [states, setStates] = useState(initial)
  const [comparisons, setComparisons] = useState<(TeamComparisonItem[] | null)[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [team, setTeam] = useState('all')
  const [show, setShow] = useState<'all' | 'different' | 'waiting'>('all')
  const [query, setQuery] = useState('')
  // Rows changed while this screen is open move to the top and flash once; the
  // number restarts the animation. The read has no entry time, so earlier rows keep product order.
  const [changed, setChanged] = useState(new Map<string, number>())
  const seen = useRef(new Map(initial.flatMap(s => s ? s.records.map(r => [s.teamId + ':' + r.brandCode + ':' + r.membershipId, r.revision] as const) : [])))
  const tick = useRef(0)
  const readSequence = useRef(0)

  const refresh = useCallback(async () => {
    const sequence = ++readSequence.current
    try {
      const next = await Promise.all(teamIds.map(readTeamCount))
      const compared = await Promise.all(next.map(s => s && !['setup', 'counting'].includes(s.phase) ? readTeamComparison(s.teamId) : null))
      if (sequence !== readSequence.current) return
      const fresh = next.flatMap(s => s ? s.records.filter(r => seen.current.get(s.teamId + ':' + r.brandCode + ':' + r.membershipId) !== r.revision)
        .map(r => s.teamId + ':' + r.brandCode) : [])
      seen.current = new Map(next.flatMap(s => s ? s.records.map(r => [s.teamId + ':' + r.brandCode + ':' + r.membershipId, r.revision] as const) : []))
      if (fresh.length) setChanged(current => {
        const marked = new Map(current)
        for (const key of fresh) marked.set(key, ++tick.current)
        return marked
      })
      setStates(next)
      setComparisons(compared)
      setUnavailable(false)
    } catch { if (sequence === readSequence.current) setUnavailable(true) }
  }, [teamIds])
  useTeamLive(teamIds, refresh, setUnavailable)

  const catalog = useMemo(() => new Map(inventory.map(item => [item.brand_code, item])), [inventory])
  const live = states.filter((s): s is TeamCountState => !!s)
  const maxCounters = Math.max(2, ...live.map(s => s.members.filter(m => m.role === 'counter').length))

  const rows = live.flatMap(s => {
    const counters = s.members.filter(m => m.role === 'counter').sort((a, b) => a.order - b.order)
    const compared = new Map((comparisons[teamIds.indexOf(s.teamId)] ?? []).map(c => [c.brandCode, c]))
    const byBrand = new Map<string, Map<string, string>>()
    for (const r of s.records) (byBrand.get(r.brandCode) ?? byBrand.set(r.brandCode, new Map()).get(r.brandCode)!).set(r.membershipId, r.quantity)
    return [...byBrand].map(([brand, counts]) => {
      const quantities = counters.map(c => counts.get(c.id))
      const comparison = compared.get(brand)
      return { key: s.teamId + ':' + brand, team: s, brand, item: catalog.get(brand), counters, quantities,
        reconciled: comparison?.reconciliation?.quantity, status: statusOf(quantities, comparison) }
    })
  })
  const totals = { equal: 0, tolerance: 0, different: 0, reconciled: 0, waiting: 0 }
  for (const row of rows) totals[row.status]++
  const found = query.trim() ? new Set(filterItems(inventory, query).map(i => i.brand_code)) : null
  const visible = rows
    .filter(r => (team === 'all' || r.team.teamId === team) && (show === 'all' || r.status === show) && (!found || found.has(r.brand)))
    .sort((a, b) => (changed.get(b.key) ?? 0) - (changed.get(a.key) ?? 0)
      || a.team.teamName.localeCompare(b.team.teamName) || (a.item?.brand_name ?? a.brand).localeCompare(b.item?.brand_name ?? b.brand))

  const segment = (pressed: boolean) => 'min-h-11 rounded-sm border-2 px-3.5 text-sm ' + (pressed ? 'border-ink bg-surface font-semibold' : 'border-transparent')
  const head = 'px-3 py-2.5 font-display text-[13px] font-bold uppercase tracking-[0.08em]'

  return <div className="flex flex-col gap-4">
    <PageTop back={{ href: '/admin/sessao/' + sessionId + '/equipes', label: 'Session teams' }}
      title={'Live count' + (live[0] ? ' — ' + live[0].warehouseName : '')} />
    {unavailable
      ? <p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-[15px] font-medium text-white">Connection lost. Counts shown may be out of date; the screen retries on its own.</p>
      : <span className="flex items-center gap-2 text-sm font-semibold text-ok"><span className="cs-live size-2.5 rounded-full bg-ok" />Live</span>}

    <div className="flex flex-wrap gap-6" aria-label="Totals">
      {([['products counted', rows.length, ''], ['equal', totals.equal + totals.tolerance, 'text-ok'], ['different', totals.different, 'text-diff'],
        ['reconciled', totals.reconciled, 'text-info'], ['waiting 2nd count', totals.waiting, '']] as const).map(([label, value, color]) =>
        <div key={label} className="flex flex-col"><span className={'font-display text-[34px] leading-none font-bold ' + color}>{value}</span><span className="text-[13px] text-ink-2">{label}</span></div>)}
    </div>

    <section aria-label="Teams" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
      {teamIds.map((id, index) => {
        const s = states[index]
        if (!s) return <div key={id} className="rounded-md border border-line bg-surface p-3.5 text-[15px] text-ink-2">A team is closed or unavailable.</div>
        const teamRows = rows.filter(r => r.team.teamId === id)
        const equal = teamRows.filter(r => r.status === 'equal' || r.status === 'tolerance' || r.status === 'reconciled').length
        const different = teamRows.filter(r => r.status === 'different').length
        const counters = s.members.filter(m => m.role === 'counter').sort((a, b) => a.order - b.order)
        const asking = counters.filter(m => m.finishState === 'requested').map(m => m.name)
        const review = s.phase === 'admin_review'
        return <div key={id} className={'flex flex-col gap-2.5 rounded-md bg-surface p-3.5 ' + (review || asking.length ? 'border-2 border-ink' : 'border border-line')}>
          <div className="flex items-center justify-between gap-2">
            <strong className="font-display text-2xl font-bold uppercase">{s.teamName}</strong>
            <Tag tone={PHASE_TONE[s.phase] ?? 'neutral'}>{PHASE_LABEL[s.phase] ?? s.phase}</Tag>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-sm bg-ground-2" aria-hidden="true">
            <div className="bg-ok" style={{ width: (teamRows.length ? equal / teamRows.length * 100 : 0) + '%' }} />
            <div className="bg-diff" style={{ width: (teamRows.length ? different / teamRows.length * 100 : 0) + '%' }} />
          </div>
          <span className="text-[13px] text-ink-2">{counters.map(c => c.name + ' ' + s.records.filter(r => r.membershipId === c.id).length).join(', ')}</span>
          {asking.length > 0 && <span className="flex items-center gap-1.5 text-[13px] font-semibold text-info">{asking.join(' and ')} asked to finish</span>}
          <Link href={'/team/' + id} className={buttonClass(review ? 'dark' : 'outline', 'sm') + ' no-underline'}>
            <Icon name={review ? 'audit' : 'live'} />{review ? 'Review ' + s.teamName : 'Open ' + s.teamName}
          </Link>
        </div>
      })}
    </section>

    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Team" className="flex flex-wrap rounded-md bg-ground-2 p-[3px]">
        <button type="button" aria-pressed={team === 'all'} className={segment(team === 'all')} onClick={() => setTeam('all')}>All teams</button>
        {live.map(s => <button key={s.teamId} type="button" aria-pressed={team === s.teamId} className={segment(team === s.teamId)} onClick={() => setTeam(s.teamId)}>{s.teamName}</button>)}
      </div>
      <div role="group" aria-label="Status" className="flex rounded-md bg-ground-2 p-[3px]">
        <button type="button" aria-pressed={show === 'all'} className={segment(show === 'all')} onClick={() => setShow('all')}>Everything</button>
        <button type="button" aria-pressed={show === 'different'} className={segment(show === 'different')} onClick={() => setShow('different')}>Different {totals.different}</button>
        <button type="button" aria-pressed={show === 'waiting'} className={segment(show === 'waiting')} onClick={() => setShow('waiting')}>Waiting {totals.waiting}</button>
      </div>
      <label className="flex min-h-12 min-w-64 flex-grow items-center gap-2 rounded-md border-2 border-ink bg-surface px-3 focus-within:outline-3 focus-within:outline-info">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span className="sr-only">Find product</span>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find product: code, name or BIN" className="min-w-0 flex-grow bg-transparent text-base outline-none placeholder:text-ink-3" />
      </label>
    </div>

    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead><tr className="bg-ink text-left text-ground">
          <th className={head}>Team</th><th className={head}>Product</th><th className={head}>BIN</th>
          {Array.from({ length: maxCounters }, (_, i) => <th key={i} className={head + ' text-right'}>Counter {i + 1}</th>)}
          <th className={head + ' text-right'}>Reconciled</th><th className={head}>Status</th>
        </tr></thead>
        <tbody>
          {visible.map(row => {
            const bpu = row.item?.bpu ?? 1
            return <tr key={row.key + ':' + (changed.get(row.key) ?? 0)} className={'border-t border-ground-2 ' + (changed.has(row.key) ? 'cs-flash ' : '') + (row.status === 'different' ? 'bg-[#FFF4EC]' : '')}>
              <td className="px-3 py-2.5"><Tag tone="dark">{row.team.teamName}</Tag></td>
              <td className="px-3 py-2.5"><span className="font-mono text-xs font-semibold text-ink-2">{row.brand}</span><br /><strong>{row.item?.brand_name ?? '—'}</strong></td>
              <td className="px-3 py-2.5">{row.item?.bins.map(b => <span key={b} className="mr-1 rounded-sm border-[1.5px] border-ink bg-safety px-1.5 py-0.5 font-mono text-[13px] font-semibold">{b}</span>)}</td>
              {Array.from({ length: maxCounters }, (_, i) => {
                const q = row.quantities[i]
                const odd = q !== undefined && row.status === 'different' && row.quantities[0] !== undefined && q !== row.quantities[0]
                return <td key={i} className="px-3 py-2.5 text-right">
                  {q === undefined ? <span className="text-ink-3">—</span> : <span className={'font-display text-xl font-bold ' + (odd ? 'text-diff' : '')}>{format(q, bpu)}</span>}
                  {row.counters[i] && <><br /><span className="text-xs text-ink-2">{row.counters[i].name}</span></>}
                </td>
              })}
              <td className="px-3 py-2.5 text-right">{row.reconciled ? <span className="font-display text-xl font-bold">{format(row.reconciled, bpu)}</span> : <span className="text-ink-3">—</span>}</td>
              <td className="px-3 py-2.5"><Tag tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Tag></td>
            </tr>
          })}
          {visible.length === 0 && <tr><td colSpan={maxCounters + 5} className="px-3 py-6 text-center text-[15px] text-ink-2">
            {rows.length ? 'No counts match these filters.' : 'No counts yet. They appear here as soon as a counter saves.'}
          </td></tr>}
        </tbody>
      </table>
    </div>
    <span className="text-[13px] text-ink-2">Counts that arrive while this screen is open move to the top and flash once.</span>
  </div>
}
