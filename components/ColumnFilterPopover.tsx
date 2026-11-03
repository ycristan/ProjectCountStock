'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BLANK, COLUMNS, type ColumnKey } from '@/lib/inventory-filters'
import { buttonClass, inputClass } from '@/components/ui'

const MAX_LISTED = 200
const WIDTH = 288

// Excel-style filter popover. Fixed position (from the header button) so the table scroll never clips it.
// `values` are the choices left by the other columns' filters; `selected` is null when this column is unfiltered.
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
  const label = COLUMNS.find((c) => c.key === column)!.label
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? values.filter((v) => v.toLowerCase().includes(q)) : values
  }, [values, search])

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
  function setVisible(on: boolean) {
    setDraft((prev) => {
      const next = new Set(prev)
      for (const v of matching) { if (on) next.add(v); else next.delete(v) }
      return next
    })
  }
  function apply() {
    const keep = values.filter((v) => draft.has(v))
    onApply(keep.length === values.length ? null : new Set(keep))
  }

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8))
  // The page does not scroll, so the popover must fit below the header: the value list shrinks, Apply stays visible.
  const top = Math.min(anchor.bottom + 4, window.innerHeight - 280)
  const maxHeight = Math.min(480, window.innerHeight - top - 8)
  const small = 'min-h-10 px-2 text-sm font-semibold underline underline-offset-4'
  return createPortal(
    <div ref={ref} role="dialog" aria-label={`Filter ${label}`} style={{ position: 'fixed', top, left, width: WIDTH, maxHeight }}
      className="z-50 flex flex-col gap-2 rounded-md border-2 border-ink bg-surface p-3 text-[15px] text-ink shadow-lg">
      <div className="grid grid-cols-2 gap-2">
        {(['asc', 'desc'] as const).map((dir) => (
          <button key={dir} type="button" onClick={() => onSort(dir)} aria-pressed={sortDir === dir}
            className={buttonClass(sortDir === dir ? 'dark' : 'outline', 'sm') + ' !px-2 !text-[13px]'}>
            {dir === 'asc' ? 'Sort A → Z' : 'Sort Z → A'}
          </button>
        ))}
      </div>
      <input type="search" aria-label="Search values" placeholder="Search values" value={search} onChange={(e) => setSearch(e.target.value)}
        className={inputClass + ' !min-h-10'} />
      <div className="flex justify-between">
        <button type="button" className={small} onClick={() => setVisible(true)}>Select all</button>
        <button type="button" className={small} onClick={() => setVisible(false)}>Clear all</button>
      </div>
      <ul className="m-0 min-h-16 flex-1 list-none overflow-y-auto rounded-sm border border-line p-0">
        {matching.slice(0, MAX_LISTED).map((v) => (
          <li key={v}>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 px-2 hover:bg-ground">
              <input type="checkbox" checked={draft.has(v)} onChange={() => toggle(v)} className="h-5 w-5 shrink-0 accent-brand" />
              <span className={'min-w-0 truncate ' + (v === BLANK ? 'italic text-ink-2' : '')} title={v}>{v}</span>
            </label>
          </li>
        ))}
        {matching.length === 0 && <li className="px-2 py-3 text-ink-2">No values found.</li>}
      </ul>
      {matching.length > MAX_LISTED && <p className="m-0 text-sm text-ink-2">Showing {MAX_LISTED} of {matching.length} — refine the search</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={small}>Cancel</button>
        <button type="button" onClick={apply} className={buttonClass('dark', 'sm') + ' !px-3'}>Apply</button>
      </div>
    </div>,
    document.body,
  )
}
