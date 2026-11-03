'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemBusca, LancarContagemPayload } from '@/actions/contagem'
import { BuscaClient } from '@/app/(counter)/busca/_components/BuscaClient'
import { lancarSoloContagem, encerrarSoloSessao } from '@/actions/solo'
import { Button, PageTop, Tag, buttonClass, tableWrapClass, thClass } from '@/components/ui'
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
    <PageTop back={{ href: '/admin/solo', label: 'Solo Count' }}
      title={<span className="flex flex-wrap items-center gap-3">{title}<Tag tone={isOpen ? 'ok' : 'neutral'}>{status}</Tag></span>}
      actions={<>
        <a href={`/api/solo/${sessionId}/export`} className={buttonClass('outline', 'sm') + ' no-underline'}>Export Excel</a>
        {isOpen && !assignedToCounter && (
          <Button variant="dark" size="sm" onClick={handleFinalise} disabled={finalising}>
            {finalising ? '...' : 'Finalise Solo Count'}
          </Button>
        )}
      </>} />
  )

  const sorted = [...entries].sort((a, b) => a.brand_code.localeCompare(b.brand_code))
  const resultsTable = (
    <div className={tableWrapClass}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-ink text-ground">
            <th className={thClass}>Brand Code</th>
            <th className={thClass}>Brand Name</th>
            <th className={thClass + ' text-right'}>Count</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={3} className="px-3 py-6 text-center text-[15px] text-ink-2">No items counted.</td></tr>
          ) : (
            sorted.map((e) => (
              <tr key={e.brand_code} className="border-t border-ground-2">
                <td className="px-3 py-2.5 font-mono text-[13px] font-semibold">{e.brand_code}</td>
                <td className="px-3 py-2.5">{e.brand_name}</td>
                <td className="px-3 py-2.5 text-right font-display text-xl font-bold">{e.final_cases}+{e.final_units}</td>
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
        <p className="m-0 mb-3 text-[15px] text-ink-2">
          {counterName ? `Counting by: ${counterName}` : 'Waiting for the counter to enter their name…'}
        </p>
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
