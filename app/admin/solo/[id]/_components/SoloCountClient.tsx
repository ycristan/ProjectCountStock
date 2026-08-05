'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ItemBusca, LancarContagemPayload } from '@/actions/contagem'
import { BuscaClient } from '@/app/(counter)/busca/_components/BuscaClient'
import { lancarSoloContagem, encerrarSoloSessao } from '@/actions/solo'
import { AssignmentPanel } from './AssignmentPanel'

type Entry = { brand_code: string; brand_name: string | null; final_cases: number; final_units: number }
type ListItem = { brand_code: string; brand_name: string }

type Props = {
  sessionId: string
  title: string
  status: string
  items: ItemBusca[]
  entries: Entry[]
  assignedToCounter: boolean
  restrictToList: boolean
  counterName: string | null
  listItems: ListItem[]
}

export function SoloCountClient({
  sessionId,
  title,
  status: initialStatus,
  items,
  entries,
  assignedToCounter: initialAssigned,
  restrictToList: initialRestrict,
  counterName,
  listItems,
}: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [assignedToCounter, setAssignedToCounter] = useState(initialAssigned)
  const [restrictToList, setRestrictToList] = useState(initialRestrict)
  const [finalising, startFinalise] = useTransition()
  const router = useRouter()
  const isOpen = status === 'open'

  const onSubmit = (payload: LancarContagemPayload) => lancarSoloContagem(sessionId, payload)

  function handleFinalise() {
    startFinalise(async () => {
      const res = await encerrarSoloSessao(sessionId)
      if (!res.error) {
        setStatus('closed')
        router.refresh()
      }
    })
  }

  // ponytail: monitor refreshes via polling, not Postgres Realtime — Realtime would need
  // a new publication entry + RLS-visible reads from the client's own JWT (currently every
  // solo read/write goes through 'use server' actions on the service-role client). Swap for
  // a Realtime channel (same setAuth pattern as the team monitor) if 5s latency is too slow.
  useEffect(() => {
    if (!assignedToCounter || !isOpen) return
    const interval = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(interval)
  }, [assignedToCounter, isOpen, router])

  const header = (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-3">
        <Link href="/admin/solo" className="text-slate-400 hover:text-slate-900 text-sm">← Solo Count</Link>
        <span className="text-slate-300">/</span>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${isOpen ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {status}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={`/api/solo/${sessionId}/export`}
          className="text-sm font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl px-4 py-2"
        >
          ↓ Export Excel
        </a>
        {isOpen && !assignedToCounter && (
          <button
            onClick={handleFinalise}
            disabled={finalising}
            className="text-sm font-semibold bg-slate-900 text-white rounded-xl px-4 py-2 hover:bg-slate-700 disabled:opacity-40"
          >
            {finalising ? '...' : 'Finalise Solo Count'}
          </button>
        )}
      </div>
    </div>
  )

  const sorted = [...entries].sort((a, b) => a.brand_code.localeCompare(b.brand_code))
  const resultsTable = (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand Code</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand Name</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.length === 0 ? (
            <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-400">No items counted.</td></tr>
          ) : (
            sorted.map((e) => (
              <tr key={e.brand_code} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-700">{e.brand_code}</td>
                <td className="px-4 py-3 text-slate-600">{e.brand_name}</td>
                <td className="px-4 py-3 text-center font-mono">{e.final_cases}+{e.final_units}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )

  const assignmentPanel = (
    <AssignmentPanel
      sessionId={sessionId}
      inventory={items}
      assignedToCounter={assignedToCounter}
      restrictToList={restrictToList}
      listItems={listItems}
      onAssignedChange={setAssignedToCounter}
      onRestrictChange={setRestrictToList}
    />
  )

  if (assignedToCounter) {
    return (
      <div>
        {header}
        {isOpen && assignmentPanel}
        <div className="text-sm text-slate-500 mb-3">
          {counterName ? `Counting by: ${counterName}` : 'Waiting for the counter to enter their name…'}
        </div>
        {resultsTable}
      </div>
    )
  }

  if (!isOpen) {
    return (
      <div>
        {header}
        {resultsTable}
      </div>
    )
  }

  return (
    <BuscaClient
      items={items}
      onSubmit={onSubmit}
      headerSlot={
        <>
          {header}
          {assignmentPanel}
        </>
      }
    />
  )
}
