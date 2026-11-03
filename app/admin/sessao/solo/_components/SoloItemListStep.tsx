'use client'

import { useState } from 'react'
import type { ItemBusca } from '@/actions/contagem'
import { filterItems } from '@/lib/inventory-search'
import { inputClass } from '@/components/ui'
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
  const matches = filterItems(inventory, termo).filter((i) => !listedCodes.has(i.brand_code))

  function addItem(item: ItemBusca) {
    onChange([...items, { brand_code: item.brand_code, brand_name: item.brand_name }])
    setTermo('')
  }

  function removeItem(brandCode: string) {
    onChange(items.filter((i) => i.brand_code !== brandCode))
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        aria-label="Search item to add to the list"
        placeholder="Search item to add to the list..."
        className={inputClass}
      />
      <div className="max-h-80 overflow-y-auto">
        <ResultList items={matches} onSelect={addItem} />
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i.brand_code} className="inline-flex items-center gap-1.5 rounded-sm border border-line-2 bg-ground-2 py-1 pl-2 pr-1 font-mono text-[13px] font-semibold">
            {i.brand_code}
            <button aria-label={`Remove ${i.brand_code}`} onClick={() => removeItem(i.brand_code)} className="inline-flex size-7 items-center justify-center rounded-sm text-ink-2 hover:text-alert">✕</button>
          </span>
        ))}
        {items.length === 0 && <span className="text-[13px] text-ink-2">No items added yet.</span>}
      </div>
    </div>
  )
}
