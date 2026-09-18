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
      {[true, false].map(active => (
        <section key={String(active)} aria-label={active ? 'Active products' : 'Inactive products'}>
          {items.some(item => (item.brand_active !== false) === active) && <h3 className={active ? 'bg-green-100 px-4 py-2 text-sm font-semibold text-green-900' : 'bg-red-100 px-4 py-2 text-sm font-semibold text-red-900'}>{active ? 'Active' : 'Inactive'}</h3>}
          {items.filter(item => (item.brand_active !== false) === active).map((item) => (
        <button
          key={item.brand_code}
          onClick={() => onSelect(item)}
          // ponytail: content-visibility:auto skips off-screen paint — handles 500+ rows without a JS virtualiser
          style={{ contentVisibility: 'auto', containIntrinsicSize: '0 56px' }}
          className={(active ? 'bg-green-50 ' : 'bg-red-50 ') + "w-full text-left px-4 py-4 border-b border-slate-100 last:border-b-0 flex justify-between items-center active:bg-slate-50 min-h-[56px]"}
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
        </section>
      ))}
    </div>
  )
}
