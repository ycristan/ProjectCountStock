'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BLANK, COLUMNS, searchValues, type ColumnKey } from '@/lib/inventory-filters'
import { Icon } from '@/components/icons'

const MAX_LISTED = 200
const WIDTH = 300

// Excel-style column filter: sort, clear, search, (Select all) + values, Cancel / Apply.
// Fixed position from the header button so the table's own scroll never clips it.
export function ColumnFilterPopover({ column, anchor, values, selected, sortDir, onApply, onSort, onClose }: {
  column: ColumnKey
  anchor: DOMRect
  values: string[]
  selected: ReadonlySet<string> | null
  sortDir: 'asc' | 'desc' | null
  onApply: (selection: ReadonlySet<string> | null) => void
  onSort: (dir: 'asc' | 'desc') => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected ?? values))
  const col = COLUMNS.find((c) => c.key === column)!
  const matching = useMemo(() => searchValues(values, search), [values, search])
  const ticked = matching.filter((v) => draft.has(v)).length
  const all = matching.length > 0 && ticked === matching.length

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (!ref.current?.contains(t) && !t.closest('[data-filter-button]')) onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const scroll = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  function toggle(v: string) {
    setDraft((prev) => {
      const next = new Set(prev)
      if (!next.delete(v)) next.add(v)
      return next
    })
  }
  function toggleAll() {
    setDraft((prev) => {
      const next = new Set(prev)
      for (const v of matching) { if (all) next.delete(v); else next.add(v) }
      return next
    })
  }
  // As in Excel, a search narrows the filter to the ticked search results.
  function apply() {
    const pool = search.trim() ? matching : values
    const keep = pool.filter((v) => draft.has(v))
    onApply(keep.length === values.length ? null : new Set(keep))
  }

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8))
  // Up to 720px or the window height: opens below the button and moves up over the header when there is not room.
  const maxHeight = Math.min(720, window.innerHeight - 16)
  const needed = Math.min(maxHeight, 320 + (Math.min(values.length, MAX_LISTED) + 1) * 36)
  const top = Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - needed - 8))
  const row = 'flex min-h-10 w-full items-center gap-2.5 px-3 text-left text-[15px] hover:bg-ground'
  const [ascLabel, descLabel] = col.numeric ? ['Sort smallest to largest', 'Sort largest to smallest'] : ['Sort A to Z', 'Sort Z to A']
  return createPortal(
    <div ref={ref} role="dialog" aria-label={`Filter ${col.label}`} style={{ position: 'fixed', top, left, width: WIDTH, maxHeight }}
      className="z-50 flex flex-col overflow-hidden rounded-md border-2 border-ink bg-surface text-ink shadow-[0_8px_24px_rgba(53,53,53,0.25)]">
      <div className="flex items-center justify-between bg-ink py-1.5 pl-3 pr-1 text-ground">
        <span className="font-display text-base font-bold">{col.label}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-9 items-center justify-center rounded-sm hover:bg-accent"><Icon name="close" size={16} /></button>
      </div>
      <div className="border-b border-line py-1">
        {(['asc', 'desc'] as const).map((dir) => (
          <button key={dir} type="button" onClick={() => onSort(dir)} aria-pressed={sortDir === dir} className={row + (sortDir === dir ? ' font-semibold' : '')}>
            <Icon name={dir === 'asc' ? 'sortUp' : 'sortDown'} size={18} />
            <span className="flex-1">{dir === 'asc' ? ascLabel : descLabel}</span>
            {sortDir === dir && <Icon name="check" size={16} />}
          </button>
        ))}
        <button type="button" disabled={!selected} onClick={() => onApply(null)} className={row + ' disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-transparent'}>
          <Icon name="close" size={18} /><span className="flex-1">Clear filter</span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <label className="flex min-h-10 items-center gap-2 rounded-md border-2 border-ink px-2 focus-within:outline-3 focus-within:outline-info">
          <Icon name="search" size={16} />
          <input type="search" aria-label="Search values" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
        </label>
        <ul className="m-0 min-h-20 flex-1 list-none overflow-y-auto rounded-sm border border-line p-0 py-1">
          {matching.length > 0 && (
            <li>
              <label className="flex min-h-9 cursor-pointer items-center gap-2.5 px-2 font-semibold hover:bg-ground">
                <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = ticked > 0 && !all }} onChange={toggleAll} className="size-[18px] shrink-0 accent-brand" />
                {search.trim() ? '(Select all search results)' : '(Select all)'}
              </label>
            </li>
          )}
          {matching.slice(0, MAX_LISTED).map((v) => (
            <li key={v}>
              <label className="flex min-h-9 cursor-pointer items-center gap-2.5 px-2 hover:bg-ground">
                <input type="checkbox" checked={draft.has(v)} onChange={() => toggle(v)} className="size-[18px] shrink-0 accent-brand" />
                <span className={'min-w-0 truncate ' + (v === BLANK ? 'italic text-ink-2' : '')} title={v}>{v}</span>
              </label>
            </li>
          ))}
          {matching.length === 0 && <li className="px-2 py-3 text-ink-2">No matches.</li>}
        </ul>
        {matching.length > MAX_LISTED && <p className="m-0 text-sm text-ink-2">Showing {MAX_LISTED} of {matching.length}. Search to narrow the list.</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-line bg-ground px-3 py-2">
        <button type="button" onClick={onClose} className="min-h-10 rounded-md border-2 border-ink bg-surface px-4 font-display text-[15px] font-bold">Cancel</button>
        <button type="button" onClick={apply} disabled={ticked === 0} className="min-h-10 rounded-md border-2 border-ink bg-ink px-4 font-display text-[15px] font-bold text-white disabled:opacity-40">Apply</button>
      </div>
    </div>,
    document.body,
  )
}
