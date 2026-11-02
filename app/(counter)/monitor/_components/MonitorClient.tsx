'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { Button, Notice, PageTop, Tag, tableWrapClass, thClass } from '@/components/ui'
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
  const [confirmError, setConfirmError] = useState(false)
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
    if (confirming) return
    setConfirming(true)
    setConfirmError(false)
    try {
      const result = await confirmarIndependente(teamId)
      if (result.success === true) setIndConfirmed(true)
      else setConfirmError(true)
    } catch {
      setConfirmError(true)
    } finally {
      setConfirming(false)
    }
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
      <PageTop title="Live Count Monitor" kicker="Tracking Counter 1 and Counter 2 in real time." />

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { label: 'Counter 1', c: c1 },
          { label: 'Counter 2', c: c2 },
        ].map(({ label, c }) => (
          <Tag key={label} tone={c?.finalized_at ? 'ok' : 'neutral'}>
            {label} {c?.finalized_at ? '✓ Finalised' : '…'}
          </Tag>
        ))}
      </div>

      {bothFinalized && !indConfirmed && (
        <div className="mb-4 flex flex-col gap-3 rounded-md border-2 border-ink bg-diff/10 p-4">
          <p className="m-0 text-base font-semibold">Both counters have finalised their count.</p>
          <p className="m-0 text-[15px] text-ink-2">Review the results below, then confirm the count is complete.</p>
          {confirmError && <Notice>Could not confirm the count. Please try again.</Notice>}
          <Button variant="primary" size="lg" full onClick={handleConfirm} disabled={confirming}>
            {confirming ? '…' : '✓ Confirm Count Complete →'}
          </Button>
        </div>
      )}

      {indConfirmed && (
        <p className="m-0 mb-4 rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-[15px] font-semibold text-ok">
          ✓ Count confirmed. Admin has been notified to check for discrepancies.
        </p>
      )}

      {!bothFinalized && (
        <p className="m-0 mb-4 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-[15px] text-info">
          Waiting for Counter 1 and Counter 2 to finalise their counts…
        </p>
      )}

      {codes.length === 0 ? (
        <p className="m-0 py-12 text-center text-[15px] text-ink-2">Waiting for first counts…</p>
      ) : (
        <div className={tableWrapClass}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink text-ground">
                <th className={thClass}>Item</th>
                <th className={thClass + ' text-right'}>C1</th>
                <th className={thClass + ' text-right'}>C2</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => {
                const c1v = getVal(code, 'contador_1')
                const c2v = getVal(code, 'contador_2')
                const both = c1v !== '—' && c2v !== '—'
                const match = both && c1v === c2v
                return (
                  <tr key={code} className={'border-t border-ground-2 ' + (both ? (match ? 'bg-ok/10' : 'bg-diff/10') : '')}>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-semibold text-ink-2">{code}</span><br />
                      <strong>{invMap[code] ?? ''}</strong>
                    </td>
                    <td className="px-3 py-2.5 text-right font-display text-xl font-bold">{c1v}</td>
                    <td className="px-3 py-2.5 text-right font-display text-xl font-bold">{c2v}</td>
                    <td className="px-3 py-2.5 text-center text-base">
                      {both && (match ? <span className="text-ok">✓</span> : <span className="text-diff">⚠</span>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex justify-between border-t border-ground-2 px-3 py-2 text-[13px] text-ink-2">
            <span>{codes.length} {codes.length === 1 ? 'item' : 'items'} counted</span>
            <span className="flex items-center gap-2 font-semibold text-ok"><span className="cs-live size-2.5 rounded-full bg-ok" />Live</span>
          </div>
        </div>
      )}
    </div>
  )
}
