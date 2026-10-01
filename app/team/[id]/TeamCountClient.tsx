'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { readTeamCount, saveTeamCount, startTeamCount } from '@/actions/team-count'
import { createClient } from '@/lib/supabase-client'
import { filterItems } from '@/lib/inventory-search'
import type { ItemBusca, LancarContagemPayload } from '@/actions/contagem'
import type { TeamCountState } from '@/lib/team-count-types'
import { CountForm } from '@/app/(counter)/busca/_components/CountForm'
import { ResultList } from '@/app/(counter)/busca/_components/ResultList'
import { SearchInput } from '@/app/(counter)/busca/_components/SearchInput'

export function TeamCountClient({ initial }: { initial: TeamCountState }) {
  const [state, setState] = useState(initial)
  const [unavailable, setUnavailable] = useState(false)
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState<{ item: ItemBusca; revision: string | null } | null>(null)
  const [notice, setNotice] = useState('')
  const [pending, startTransition] = useTransition()
  const command = useRef<{ payload: string; id: string } | null>(null)
  const readSequence = useRef(0)
  const teamId = initial.teamId
  const refresh = useCallback(async () => {
    const sequence = ++readSequence.current
    try {
      const next = await readTeamCount(teamId)
      if (sequence !== readSequence.current) return
      if (!next) { setUnavailable(true); return }
      setState(next)
      setUnavailable(false)
    } catch { if (sequence === readSequence.current) setUnavailable(true) }
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
    for (const table of ['team_count_records', 'team_flows', 'team_memberships'])
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
  const items = state.items.map(item => {
    const record = own.get(item.brand_code)
    return { ...item, jaContado: !!record, entryExistente: record
      ? { pallets: record.pallets, cases: record.cases, units: record.units } : null }
  })
  const monitor = state.role !== 'counter'
  const counters = state.members.filter(m => m.role === 'counter')
  const records = new Map(state.records.map(r => [r.brandCode + ':' + r.membershipId, r]))
  const counted = new Set(state.records.map(r => r.brandCode))

  async function submit(payload: LancarContagemPayload) {
    if (!selected || !canCount) return { error: 'Counting is blocked. Refresh your team.' }
    const fingerprint = JSON.stringify([selected, payload])
    if (command.current?.payload !== fingerprint) command.current = { payload: fingerprint, id: crypto.randomUUID() }
    try {
      const result = await saveTeamCount(teamId, command.current.id, selected.revision, selected.item, payload)
      if (!result.error) command.current = null
      return result
    } catch {
      return { error: 'Response unavailable. Retry the same count to confirm it safely.' }
    }
  }

  return <section className="mt-4 space-y-4">
    <h1 className="text-xl font-semibold">{state.teamName} — {state.warehouseName}</h1>
    <p>{state.role === 'counter' ? 'Blind count — only your quantities are shown.' : 'Team monitor — product consultation only.'}</p>
    <p>Phase: {state.phase}</p>
    {unavailable && <p role="alert">Connection or access unavailable. Counts are blocked until refreshed.</p>}
    {notice && <p role="status">{notice}</p>}
    <button className="border rounded px-3 py-2" onClick={() => void refresh()}>Refresh team</button>
    {state.role === 'admin' && state.phase === 'setup' && <button disabled={pending || unavailable}
      className="bg-slate-900 text-white rounded px-3 py-2" onClick={() => startTransition(async () => {
        const result = await startTeamCount(teamId, state.revision)
        setNotice(result.error ?? 'Counting started.')
        await refresh()
      })}>{pending ? 'Starting...' : 'Start team counting'}</button>}
    {state.phase !== 'setup' && <>
      <h2 className="text-lg font-semibold">Search Item</h2>
      {selected && canCount ? <CountForm key={selected.item.brand_code}
        item={selected.item} onSubmit={submit}
        onVoltar={() => setSelected(null)}
        onSucesso={result => {
          setSelected(null)
          setNotice('Count confirmed: ' + result.final_cases + '+' + result.final_units)
          void refresh()
        }} /> : <>
        <SearchInput value={term} onChange={setTerm} />
        <ResultList items={filterItems(items, term)} onSelect={item => {
          if (canCount) setSelected({ item, revision: own.get(item.brand_code)?.revision ?? null })
          else setNotice(item.brand_name + ' · BIN: ' + (item.bins.join(', ') || '—') + ' · BPU: ' + item.bpu)
        }} />
      </>}
      {monitor && !unavailable && <div className="overflow-x-auto">
        <h2 className="font-semibold mb-2">Provisional counts — not a reconciled result</h2>
        <table className="w-full text-sm border-collapse">
          <thead><tr><th className="border p-2">Product</th>
            {counters.map(m => <th key={m.id} className="border p-2">Counter {m.order} — {m.name}</th>)}
            <th className="border p-2">Status</th></tr></thead>
          <tbody>{state.items.filter(i => counted.has(i.brand_code)).map(item => {
            const values = counters.map(m => records.get(item.brand_code + ':' + m.id))
            return <tr key={item.brand_code} data-brand={item.brand_code}>
              <td className="border p-2">{item.brand_code} — {item.brand_name}</td>
              {values.map((r, index) => <td key={counters[index].id} className="border p-2">
                {r ? r.quantity + ' units · ' + r.method : 'Not counted'}
              </td>)}
              <td className="border p-2">{values.some(r => !r) ? 'Pending counts'
                : new Set(values.map(r => r!.quantity)).size === 1 ? 'Equal' : 'Provisional difference'}</td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </>}
  </section>
}
