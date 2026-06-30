'use client'

import type { ItemBusca } from '@/actions/contagem'

type Props = {
  items: ItemBusca[]
  onSelect: (item: ItemBusca) => void
}

export function ResultList({ items, onSelect }: Props) {
  if (items.length === 0) return null

  return (
    <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden bg-white">
      {items.map((item) => (
        <button
          key={item.brand_code}
          onClick={() => onSelect(item)}
          className="w-full text-left px-4 py-4 border-b border-slate-100 last:border-b-0 flex justify-between items-center active:bg-slate-50 min-h-[56px]"
        >
          <div>
            <div className="text-sm font-semibold text-slate-900">{item.brand_code}</div>
            <div className="text-xs text-slate-500">{item.brand_name}</div>
            {item.jaContado && (
              <div className="text-xs text-green-600 font-semibold mt-0.5">✓ Already counted</div>
            )}
          </div>
          <div className="text-slate-400 text-lg">›</div>
        </button>
      ))}
    </div>
  )
}
