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
          className="w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 flex justify-between items-center active:bg-slate-50"
        >
          <div>
            <div className="text-sm font-semibold text-slate-900">{item.brand_code}</div>
            <div className="text-xs text-slate-500">{item.brand_name}</div>
            {item.jaContado && (
              <div className="text-xs text-green-600 font-semibold mt-0.5">✓ Já contado</div>
            )}
          </div>
          <div className="text-indigo-500 text-lg">›</div>
        </button>
      ))}
    </div>
  )
}
