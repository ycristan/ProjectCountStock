'use client'

import { useState, useTransition } from 'react'
import type { ItemBusca } from '@/actions/contagem'
import { Notice, cardClass, inputClass, segmentClass, segmentGroupClass } from '@/components/ui'
import { atribuirSoloContador, adicionarItemListaSolo, removerItemListaSolo } from '@/actions/solo'

type ListItem = { brand_code: string; brand_name: string }

type Props = {
  sessionId: string
  inventory: ItemBusca[]
  assignedToCounter: boolean
  restrictToList: boolean
  listItems: ListItem[]
  onAssignedChange: (v: boolean) => void
  onRestrictChange: (v: boolean) => void
}

export function AssignmentPanel({
  sessionId,
  inventory,
  assignedToCounter,
  restrictToList,
  listItems: initialListItems,
  onAssignedChange,
  onRestrictChange,
}: Props) {
  const [listItems, setListItems] = useState(initialListItems)
  const [termo, setTermo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const listedCodes = new Set(listItems.map((i) => i.brand_code))
  const ql = termo.trim().toLowerCase()
  const matches = ql
    ? inventory
        .filter(
          (i) =>
            !listedCodes.has(i.brand_code) &&
            (i.brand_code.toLowerCase().includes(ql) || i.brand_name.toLowerCase().includes(ql))
        )
        .slice(0, 8)
    : []

  function setAssigned(next: boolean) {
    startTransition(async () => {
      const res = await atribuirSoloContador(sessionId, next, restrictToList)
      if (res.error) { setErro(res.error); return }
      setErro(null)
      onAssignedChange(next)
    })
  }

  function setRestrict(next: boolean) {
    startTransition(async () => {
      const res = await atribuirSoloContador(sessionId, assignedToCounter, next)
      if (res.error) { setErro(res.error); return }
      setErro(null)
      onRestrictChange(next)
    })
  }

  function addItem(item: ItemBusca) {
    setListItems((prev) => [...prev, { brand_code: item.brand_code, brand_name: item.brand_name }])
    setTermo('')
    startTransition(async () => {
      const res = await adicionarItemListaSolo(sessionId, item.brand_code)
      if (res.error) {
        setListItems((prev) => prev.filter((i) => i.brand_code !== item.brand_code))
        setErro(res.error)
      } else {
        setErro(null)
      }
    })
  }

  function removeItem(brandCode: string) {
    const removed = listItems.find((i) => i.brand_code === brandCode)
    setListItems((prev) => prev.filter((i) => i.brand_code !== brandCode))
    startTransition(async () => {
      const res = await removerItemListaSolo(sessionId, brandCode)
      if (res.error) {
        if (removed) setListItems((prev) => [...prev, removed])
        setErro(res.error)
      } else {
        setErro(null)
      }
    })
  }

  const rowLabel = 'text-[15px] font-semibold'
  return (
    <div className={cardClass + ' mb-4 flex flex-col gap-4 p-3.5'}>
      {erro && <Notice>{erro}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={rowLabel}>Who counts</span>
        <div role="group" aria-label="Who counts" className={segmentGroupClass}>
          <button type="button" aria-pressed={!assignedToCounter} onClick={() => setAssigned(false)} disabled={isPending} className={segmentClass(!assignedToCounter)}>Myself</button>
          <button type="button" aria-pressed={assignedToCounter} onClick={() => setAssigned(true)} disabled={isPending} className={segmentClass(assignedToCounter)}>Solo counter</button>
        </div>
      </div>

      {assignedToCounter && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={rowLabel}>Item list</span>
            <div role="group" aria-label="Item list" className={segmentGroupClass}>
              <button type="button" aria-pressed={!restrictToList} onClick={() => setRestrict(false)} disabled={isPending} className={segmentClass(!restrictToList)}>Free add</button>
              <button type="button" aria-pressed={restrictToList} onClick={() => setRestrict(true)} disabled={isPending} className={segmentClass(restrictToList)}>Restricted list</button>
            </div>
          </div>

          {restrictToList && (
            <div className="flex flex-col gap-3">
              <input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                aria-label="Search item to add to the list"
                placeholder="Search item to add to the list..."
                className={inputClass}
              />
              {matches.length > 0 && (
                <div className="overflow-hidden rounded-md border border-line">
                  {matches.map((item) => (
                    <button
                      key={item.brand_code}
                      onClick={() => addItem(item)}
                      className="min-h-11 w-full border-b border-ground-2 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-ground"
                    >
                      <span className="font-mono text-[13px] font-semibold">{item.brand_code}</span> — {item.brand_name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {listItems.map((i) => (
                  <span key={i.brand_code} className="inline-flex items-center gap-1.5 rounded-sm border border-line-2 bg-ground-2 py-1 pl-2 pr-1 font-mono text-[13px] font-semibold">
                    {i.brand_code}
                    <button onClick={() => removeItem(i.brand_code)} aria-label={'Remove ' + i.brand_code} className="inline-flex size-7 items-center justify-center rounded-sm text-ink-2 hover:text-alert">✕</button>
                  </span>
                ))}
                {listItems.length === 0 && <span className="text-[13px] text-ink-2">No items added yet.</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
