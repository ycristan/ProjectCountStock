'use client'

import { useState, useTransition } from 'react'
import type { ItemBusca } from '@/actions/contagem'
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

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-4">
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-slate-700">Who counts</span>
        <div className="flex gap-2">
          <button
            onClick={() => setAssigned(false)}
            disabled={isPending}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${!assignedToCounter ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500'}`}
          >
            Myself
          </button>
          <button
            onClick={() => setAssigned(true)}
            disabled={isPending}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${assignedToCounter ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500'}`}
          >
            Solo counter
          </button>
        </div>
      </div>

      {assignedToCounter && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-semibold text-slate-700">Item list</span>
            <div className="flex gap-2">
              <button
                onClick={() => setRestrict(false)}
                disabled={isPending}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${!restrictToList ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500'}`}
              >
                Free add
              </button>
              <button
                onClick={() => setRestrict(true)}
                disabled={isPending}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${restrictToList ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500'}`}
              >
                Restricted list
              </button>
            </div>
          </div>

          {restrictToList && (
            <div>
              <input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Search item to add to the list..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
              />
              {matches.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
                  {matches.map((item) => (
                    <button
                      key={item.brand_code}
                      onClick={() => addItem(item)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    >
                      <span className="font-semibold">{item.brand_code}</span> — {item.brand_name}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {listItems.map((i) => (
                  <span key={i.brand_code} className="inline-flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1 text-xs">
                    {i.brand_code}
                    <button onClick={() => removeItem(i.brand_code)} className="text-slate-400 hover:text-red-500">
                      ✕
                    </button>
                  </span>
                ))}
                {listItems.length === 0 && <span className="text-xs text-slate-400">No items added yet.</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
