'use client'

import { useState } from 'react'
import type { ItemBusca } from '@/actions/contagem'
import { ResultList } from '@/app/(counter)/busca/_components/ResultList'

type Item = { brand_code: string; brand_name: string }

type Props = {
  inventory: ItemBusca[]
  items: Item[]
  onChange: (items: Item[]) => void
}

export function SoloItemListStep({ inventory, items, onChange }: Props) {
  const [termo, setTermo] = useState('')
  const listedCodes = new Set(items.map((i) => i.brand_code))
  const ql = termo.trim().toLowerCase()
  const matches = ql
    ? inventory
        .filter(
          (i) =>
            !listedCodes.has(i.brand_code) &&
            (i.brand_code.toLowerCase().includes(ql) || i.brand_name.toLowerCase().includes(ql))
        )
    : []

  function addItem(item: ItemBusca) {
    onChange([...items, { brand_code: item.brand_code, brand_name: item.brand_name }])
    setTermo('')
  }

  function removeItem(brandCode: string) {
    onChange(items.filter((i) => i.brand_code !== brandCode))
  }

  return (
    <div>
      <input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Search item to add to the list..."
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
      />
      <div className="max-h-80 overflow-y-auto">
        <ResultList items={matches} onSelect={addItem} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i.brand_code} className="inline-flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1 text-xs">
            {i.brand_code}
            <button aria-label={`Remove ${i.brand_code}`} onClick={() => removeItem(i.brand_code)} className="text-slate-400 hover:text-red-500">
              ✕
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-slate-400">No items added yet.</span>}
      </div>
    </div>
  )
}
