'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { decideTeamFinish, readTeamCount, readTeamInventory, requestTeamFinish, saveTeamCount, startTeamCount } from '@/actions/team-count'
import { createClient } from '@/lib/supabase-client'
import type { ItemBusca, LancarContagemPayload } from '@/actions/contagem'
import type { TeamCountState } from '@/lib/team-count-types'
import { BuscaClient } from '@/app/(counter)/busca/_components/BuscaClient'

export function TeamCountClient({ initial, inventory }: { initial: TeamCountState; inventory: ItemBusca[] }) {
  const [state, setState] = useState(initial)
  const [catalog, setCatalog] = useState(inventory)
  const [unavailable, setUnavailable] = useState(false)
  const [notice, setNotice] = useState('')
  const [pending, startTransition] = useTransition()
  const command = useRef<{ payload: string; id: string; revision: string | null } | null>(null)
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
    {monitor && !unavailable && state.phase !== 'setup' && <div className="overflow-x-auto">
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
