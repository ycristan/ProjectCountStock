'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { confirmarIndependente } from '@/actions/sessao'

type Entry = {
  brand_code: string
  counter_role: string
  final_cases: number
  final_units: number
}

type InvItem = {
  brand_code: string
  brand_name: string
}

type Counter = {
  id: string
  role: string
  finalized_at: string | null
}

type Props = {
  teamId: string
  initialEntries: Entry[]
  inventory: InvItem[]
  counters: Counter[]
  initialIndConfirmed: boolean
}

export function MonitorClient({
  teamId,
  initialEntries,
  inventory,
  counters: initCounters,
  initialIndConfirmed,
}: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [countersState, setCountersState] = useState(initCounters)
  const [indConfirmed, setIndConfirmed] = useState(initialIndConfirmed)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel>

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)

      channel = supabase
        .channel(`monitor-ind-${teamId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'count_entries', filter: `team_id=eq.${teamId}` },
          ({ new: row }) => {
            const r = row as Entry
            if (r.counter_role === 'independente') return
            setEntries((prev) => [
              ...prev.filter(
                (e) => !(e.brand_code === r.brand_code && e.counter_role === r.counter_role)
              ),
              r,
            ])
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'counter_accounts',
            filter: `team_id=eq.${teamId}`,
          },
          ({ new: row }) => {
            const r = row as { id: string; role: string; finalized_at: string | null }
            setCountersState((prev) =>
              prev.map((c) => (c.id === r.id ? { ...c, finalized_at: r.finalized_at } : c))
            )
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` },
          () => router.refresh()
        )
        .subscribe()
    })

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [teamId, router])

  async function handleConfirm() {
    setConfirming(true)
    await confirmarIndependente(teamId)
    setIndConfirmed(true)
    setConfirming(false)
  }

  const invMap = Object.fromEntries(inventory.map((i) => [i.brand_code, i.brand_name]))

  const codes = [
    ...new Set(
      entries.filter((e) => e.counter_role !== 'independente').map((e) => e.brand_code)
    ),
  ].sort()

  function getVal(code: string, role: string) {
    const e = entries.find((e) => e.brand_code === code && e.counter_role === role)
    return e ? `${e.final_cases}+${e.final_units}` : '—'
  }

  const c1 = countersState.find((c) => c.role === 'contador_1')
  const c2 = countersState.find((c) => c.role === 'contador_2')
  const bothFinalized = !!c1?.finalized_at && !!c2?.finalized_at

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-1">Live Count Monitor</h2>
      <p className="text-sm text-slate-500 mb-4">Tracking Counter 1 and Counter 2 in real time.</p>

      <div className="flex gap-2 mb-5">
        {[
          { label: 'Counter 1', c: c1 },
          { label: 'Counter 2', c: c2 },
        ].map(({ label, c }) => (
          <span
            key={label}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
              c?.finalized_at ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {label} {c?.finalized_at ? '✓ Finalised' : '…'}
          </span>
        ))}
      </div>

      {bothFinalized && !indConfirmed && (
        <div className="mb-5 bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 text-center">
          <p className="text-amber-900 font-semibold text-base mb-1">
            Both counters have finalised their count.
          </p>
          <p className="text-amber-700 text-sm mb-4">
            Review the results below, then confirm the count is complete.
          </p>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="bg-slate-900 text-white font-bold px-8 py-3 rounded-xl text-base hover:bg-slate-700 disabled:opacity-50"
          >
            {confirming ? '…' : '✓ Confirm Count Complete →'}
          </button>
        </div>
      )}

      {indConfirmed && (
        <div className="mb-5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 font-semibold">
          ✓ Count confirmed. Admin has been notified to check for discrepancies.
        </div>
      )}

      {!bothFinalized && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
          Waiting for Counter 1 and Counter 2 to finalise their counts…
        </div>
      )}

      {codes.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">Waiting for first counts…</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Item
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">C1</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">C2</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {codes.map((code) => {
                const c1v = getVal(code, 'contador_1')
                const c2v = getVal(code, 'contador_2')
                const both = c1v !== '—' && c2v !== '—'
                const match = both && c1v === c2v
                return (
                  <tr key={code} className={both ? (match ? 'bg-green-50' : 'bg-amber-50') : ''}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 text-sm">{code}</div>
                      <div className="text-xs text-slate-400">{invMap[code] ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-sm text-slate-700">{c1v}</td>
                    <td className="px-4 py-3 text-center font-mono text-sm text-slate-700">{c2v}</td>
                    <td className="px-3 py-3 text-center text-base">
                      {both && (match ? (
                        <span className="text-green-500">✓</span>
                      ) : (
                        <span className="text-amber-500">⚠</span>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400 flex justify-between">
            <span>{codes.length} {codes.length === 1 ? 'item' : 'items'} counted</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />
              Live
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
