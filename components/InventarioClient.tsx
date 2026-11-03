'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRouter } from 'next/navigation'
import type { ItemInventario } from '@/actions/inventario'
import { editarItemInventario } from '@/actions/inventario'
import { filterItems } from '@/lib/inventory-search'
import { Tag, buttonClass, thClass } from '@/components/ui'
import { Icon } from '@/components/icons'
import { ColumnFilterPopover } from '@/components/ColumnFilterPopover'
import { COLUMNS, EMPTY_FILTERS, activeFilterKeys, applyFilters, distinctValues, type ColumnKey, type FilterState } from '@/lib/inventory-filters'

const inp = 'min-h-10 w-full min-w-0 rounded-md border-2 border-ink bg-surface px-2 text-[15px] outline-none focus-visible:outline-3 focus-visible:outline-info'

type EditRow = {
  brand_name: string
  bpu: string
  pallet_size: string
  weight_avg: string
  category: string
  category1: string
  bins: [string, string, string, string]
}

function toEdit(item: ItemInventario): EditRow {
  return {
    brand_name: item.brand_name,
    bpu: String(item.bpu),
    pallet_size: String(item.pallet_size),
    weight_avg: String(item.weight_avg),
    category: item.category,
    category1: item.category1,
    bins: [item.bins[0] ?? '', item.bins[1] ?? '', item.bins[2] ?? '', item.bins[3] ?? ''],
  }
}

// Fixed widths (px) in column order; the table is table-layout: fixed so editing never moves a column.
// Sum ≈ 1216 so a 1280px screen needs no sideways scroll; Brand Name gets the most room.
const COLS = [80, 80, 220, 110, 110, 52, 64, 72, 72, 72, 72, 72, 140]
const MIN_WIDTH = COLS.reduce((a, b) => a + b, 0)
const ROW_HEIGHT = 56

export function InventarioClient({ items }: { items: ItemInventario[] }) {
  const router = useRouter()
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditRow | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [open, setOpen] = useState<{ key: ColumnKey; rect: DOMRect } | null>(null)
  const [isPending, startTransition] = useTransition()
  const filtersOn = activeFilterKeys(filters).length > 0
  const scrollRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()

  // The table fills the rest of the window so only the table scrolls, whatever sits above it.
  useEffect(() => {
    const fit = () => {
      const el = scrollRef.current
      if (el) setHeight(Math.max(320, window.innerHeight - el.getBoundingClientRect().top - window.scrollY - 24))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [query, erro, filtersOn])

  function startEdit(item: ItemInventario) {
    setEditingCode(item.brand_code)
    setEdit(toEdit(item))
    setErro(null)
  }

  function cancel() {
    setEditingCode(null)
    setEdit(null)
    setErro(null)
  }

  function setField(field: keyof Omit<EditRow, 'bins'>, value: string) {
    setEdit((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  function setBin(index: 0 | 1 | 2 | 3, value: string) {
    setEdit((prev) => {
      if (!prev) return prev
      const bins = [...prev.bins] as [string, string, string, string]
      bins[index] = value
      return { ...prev, bins }
    })
  }

  function save() {
    if (!editingCode || !edit) return
    startTransition(async () => {
      const result = await editarItemInventario(editingCode, {
        brand_name: edit.brand_name,
        bpu: Number(edit.bpu) || 0,
        pallet_size: Number(edit.pallet_size) || 0,
        weight_avg: Number(edit.weight_avg) || 0,
        category: edit.category,
        category1: edit.category1,
        bins: edit.bins.filter(Boolean),
      })
      if (result.error) {
        setErro(result.error)
      } else {
        setEditingCode(null)
        setEdit(null)
        router.refresh()
      }
    })
  }

  const searched = useMemo(() => (query.trim() ? filterItems(items, query) : items), [items, query])
  const shown = useMemo(() => applyFilters(searched, filters), [searched, filters])
  const closeFilter = useCallback(() => setOpen(null), [])
  const anyActive = filtersOn || filters.sort !== null
  const openValues = useMemo(() => (open ? distinctValues(searched, filters, open.key) : []), [open, searched, filters])
  // TanStack Virtual is not memoisable; nothing here is passed to memoised children.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: shown.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })
  const rows = virtualizer.getVirtualItems()
  const padTop = rows.length ? rows[0].start : 0
  const padBottom = rows.length ? virtualizer.getTotalSize() - rows[rows.length - 1].end : 0
  const cell = 'px-2 py-1'
  const clip = 'block truncate'
  const none = <span className="text-ink-3">—</span>
  const text = (v: string | number) => v === '' || v === 0 ? none : <span className={clip} title={String(v)}>{v}</span>

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-12 items-center gap-2 rounded-md border-2 border-ink bg-surface px-3 focus-within:outline-3 focus-within:outline-info">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span className="sr-only">Search products</span>
        <input value={query} onChange={(e) => { setQuery(e.target.value); scrollRef.current?.scrollTo({ top: 0 }) }} placeholder="Code, name or BIN"
          className="min-w-0 flex-grow bg-transparent text-base outline-none placeholder:text-ink-3" />
      </label>
      {(query.trim() || filtersOn || anyActive) && (
        <div className="flex flex-wrap items-center gap-3">
          {(query.trim() || filtersOn) && <span className="text-sm text-ink-2">{shown.length} of {items.length} products</span>}
          {anyActive && <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setOpen(null); scrollRef.current?.scrollTo({ top: 0 }) }}
            className="min-h-10 px-1 text-sm font-semibold underline underline-offset-4">Clear all filters</button>}
        </div>
      )}
      {erro && <p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-[15px] font-medium text-white">{erro}</p>}
      <div ref={scrollRef} data-testid="inventory-scroll" style={{ height }} className="h-[calc(100dvh-300px)] min-h-80 overflow-auto rounded-md border border-line bg-surface">
        <table className="w-full table-fixed border-collapse text-[15px]" style={{ minWidth: MIN_WIDTH }}>
          <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-ink text-ground">
              {COLUMNS.map((c, i) => {
                const active = filters.selected[c.key] !== undefined || filters.sort?.key === c.key
                return (
                  <th key={c.key} className={thClass + ' px-2 align-bottom leading-tight' + (i >= 5 && i <= 7 ? ' text-right' : '')}>
                    <div className={'flex flex-col gap-1 ' + (i >= 5 && i <= 7 ? 'items-end' : 'items-start')}>
                      <span>{c.label}</span>
                      <button type="button" data-filter-button aria-label={`Filter ${c.label}`} aria-haspopup="dialog" aria-expanded={open?.key === c.key}
                        onClick={(e) => setOpen(open?.key === c.key ? null : { key: c.key, rect: e.currentTarget.getBoundingClientRect() })}
                        className={'inline-flex h-7 w-7 items-center justify-center rounded-sm border focus-visible:outline-3 focus-visible:outline-info ' + (active ? 'border-ground bg-ground text-ink' : 'border-transparent text-ground hover:border-ground')}>
                        <Icon name="filter" size={16} />
                      </button>
                    </div>
                  </th>
                )
              })}
              <th className={thClass + ' px-2'}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }} />}
            {rows.map((vr) => {
              const item = shown[vr.index]
              const isEditing = editingCode === item.brand_code && edit !== null
              return (
                <tr key={item.brand_code} style={{ height: ROW_HEIGHT }} className={'border-t border-ground-2 ' + (isEditing ? 'bg-ground' : '')}>
                  <td className={cell}>{item.brand_active ? <Tag tone="ok">Active</Tag> : <Tag tone="neutral">Inactive</Tag>}</td>
                  <td className={cell + ' font-mono text-[13px] font-semibold text-ink-2'}>{text(item.brand_code)}</td>
                  {isEditing && edit ? (
                    <>
                      <td className={cell}><input aria-label="Brand Name" className={inp} value={edit.brand_name} onChange={(e) => setField('brand_name', e.target.value)} /></td>
                      <td className={cell}><input aria-label="Category" className={inp} value={edit.category} onChange={(e) => setField('category', e.target.value)} /></td>
                      <td className={cell}><input aria-label="Category1" className={inp} value={edit.category1} onChange={(e) => setField('category1', e.target.value)} /></td>
                      <td className={cell}><input aria-label="BPU" className={inp + ' text-right'} type="number" min="0" value={edit.bpu} onChange={(e) => setField('bpu', e.target.value)} /></td>
                      <td className={cell}><input aria-label="Pallet Size" className={inp + ' text-right'} type="number" min="0" value={edit.pallet_size} onChange={(e) => setField('pallet_size', e.target.value)} /></td>
                      <td className={cell}><input aria-label="Weight AVG" className={inp + ' text-right'} type="number" min="0" step="0.01" value={edit.weight_avg} onChange={(e) => setField('weight_avg', e.target.value)} /></td>
                      {([0, 1, 2, 3] as const).map((i) => (
                        <td key={i} className={cell}><input aria-label={`BIN ${i + 1}`} className={inp + ' font-mono ' + (edit.bins[i] ? 'bg-line' : 'border-dashed border-line-2')} value={edit.bins[i]} onChange={(e) => setBin(i, e.target.value)} placeholder={`BIN ${i + 1}`} /></td>
                      ))}
                      <td className={cell + ' whitespace-nowrap text-right'}>
                        <button type="button" onClick={cancel} disabled={isPending} className="min-h-10 px-2 text-sm font-semibold underline underline-offset-4">Cancel</button>
                        <button type="button" onClick={save} disabled={isPending} className={buttonClass('dark', 'sm') + ' !px-2'}><Icon name="check" />{isPending ? '...' : 'Save'}</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={cell + ' font-semibold'}>{text(item.brand_name)}</td>
                      <td className={cell + ' text-ink-2'}>{text(item.category)}</td>
                      <td className={cell + ' text-ink-2'}>{text(item.category1)}</td>
                      <td className={cell + ' text-right'}>{text(item.bpu)}</td>
                      <td className={cell + ' text-right'}>{text(item.pallet_size)}</td>
                      <td className={cell + ' text-right'}>{Number(item.weight_avg) > 0 ? text(item.weight_avg) : none}</td>
                      {[0, 1, 2, 3].map((i) => (
                        <td key={i} className={cell + ' font-mono text-[13px] font-semibold'}>{text(item.bins[i] ?? '')}</td>
                      ))}
                      <td className={cell + ' text-right'}>
                        <button type="button" onClick={() => startEdit(item)} aria-label={'Edit ' + item.brand_code} className={buttonClass('outline', 'sm')}><Icon name="edit" />Edit</button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }} />}
            {shown.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="px-4 py-10 text-center text-[15px] text-ink-2">
                  {items.length ? 'No products match this search or these filters.' : 'No items in inventory. Import an .xlsx file.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <ColumnFilterPopover key={open.key} column={open.key} anchor={open.rect} values={openValues}
          selected={filters.selected[open.key] ?? null} sortDir={filters.sort?.key === open.key ? filters.sort.dir : null}
          onClose={closeFilter}
          onApply={(sel) => {
            const key = open.key
            setFilters((f) => {
              const selected = { ...f.selected }
              if (sel) selected[key] = sel
              else delete selected[key]
              return { ...f, selected }
            })
            setOpen(null)
            scrollRef.current?.scrollTo({ top: 0 })
          }}
          onSort={(dir) => { setFilters((f) => ({ ...f, sort: { key: open.key, dir } })); setOpen(null); scrollRef.current?.scrollTo({ top: 0 }) }} />
      )}
    </div>
  )
}
