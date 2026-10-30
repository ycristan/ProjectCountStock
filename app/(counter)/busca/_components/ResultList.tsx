'use client'

import type { ItemBusca } from '@/actions/contagem'
import { Tag } from '@/components/ui'

type Props = {
  items: ItemBusca[]
  onSelect: (item: ItemBusca) => void
}

export function ResultList({ items, onSelect }: Props) {
  if (items.length === 0) return null

  return (
    <div className="mt-3 flex flex-col gap-4">
      {[true, false].map(active => {
        const group = items.filter(item => (item.brand_active !== false) === active)
        if (!group.length) return null
        return <section key={String(active)} aria-label={active ? 'Active products' : 'Inactive products'} className="flex flex-col gap-2">
          <h3 className="m-0 font-display text-sm font-bold uppercase tracking-[0.08em] text-ink-2">{active ? 'Active' : 'Inactive'}</h3>
          {group.map((item) => (
            <button
              key={item.brand_code}
              onClick={() => onSelect(item)}
              // ponytail: content-visibility:auto skips off-screen paint — handles 500+ rows without a JS virtualiser
              style={{ contentVisibility: 'auto', containIntrinsicSize: '0 72px' }}
              className={'flex min-h-16 w-full items-center gap-3 rounded-[10px] p-3 text-left '
                + (active ? 'border border-line bg-surface' : 'border border-dashed border-line-2 bg-[#ECE9E1]')}
            >
              <span className="flex min-w-0 flex-grow flex-col gap-0.5">
                <span className="font-mono text-[13px] font-semibold text-ink-2">
                  {item.brand_code}{item.bins?.length ? ' · BIN ' + item.bins.join(', ') : ''}
                </span>
                <span className="text-base font-semibold">{item.brand_name}</span>
              </span>
              {item.jaContado
                ? <span className="flex items-center gap-1 text-xs font-semibold text-ok">
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5 9-10" /></svg>
                    Already counted
                  </span>
                : !active ? <Tag>Inactive</Tag>
                : <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3"><path d="M9 5l7 7-7 7" /></svg>}
            </button>
          ))}
        </section>
      })}
    </div>
  )
}
