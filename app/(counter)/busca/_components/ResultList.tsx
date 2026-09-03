'use client'

import type { ItemBusca } from '@/actions/contagem'

type Props = {
  items: ItemBusca[]
  status: 'active' | 'inactive'
  onSelect: (item: ItemBusca) => void
}

export function ResultList({ items, status, onSelect }: Props) {
  if (items.length === 0) return null
  const isInactive = status === 'inactive'

  return (
    <div className={`rounded-xl border overflow-hidden ${isInactive ? 'border-rose-200 bg-rose-50/40' : 'border-emerald-200 bg-emerald-50/40'}`}>
      {items.map((item) => (
        <button
          key={item.brand_code}
          onClick={() => onSelect(item)}
          style={{ contentVisibility: 'auto', containIntrinsicSize: '0 56px' }}
          className={`w-full text-left px-4 py-4 border-b last:border-b-0 flex justify-between items-center min-h-[56px] ${isInactive ? 'border-rose-100 active:bg-rose-100/60' : 'border-emerald-100 active:bg-emerald-100/60'}`}
        >
          <div>
            <div className="text-sm font-semibold text-slate-900">{item.brand_code}</div>
            <div className="text-xs text-slate-500">{item.brand_name}</div>
            {item.jaContado && <div className="text-xs text-green-600 font-semibold mt-0.5">✓ Already counted</div>}
          </div>
          <div className={isInactive ? 'text-rose-400 text-lg' : 'text-emerald-500 text-lg'}>›</div>
        </button>
      ))}
    </div>
  )
}
