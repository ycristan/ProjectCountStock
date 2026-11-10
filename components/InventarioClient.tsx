'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useRouter } from 'next/navigation'
import type { ItemInventario } from '@/actions/inventario'
import { alterarStatusItem, editarItemInventario } from '@/actions/inventario'
import { NewProductDialog } from '@/components/NewProductDialog'
import { parseInventoryNumbers } from '@/lib/parse-number'
import { Tag, buttonClass } from '@/components/ui'
import { Icon } from '@/components/icons'
import { ColumnFilterPopover } from '@/components/ColumnFilterPopover'
import { COLUMNS, EMPTY_FILTERS, activeFilterKeys, applyFilters, distinctValues, type ColumnKey, type FilterState } from '@/lib/inventory-filters'

const inp = 'min-h-10 w-full min-w-0 rounded-md border-2 border-ink bg-surface px-1.5 text-[15px] outline-none focus-visible:outline-3 focus-visible:outline-info [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

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
// Sum 1300: fits a 1366px screen; wider screens stretch every column in proportion.
const COLS = [86, 96, 212, 116, 116, 72, 80, 84, 72, 72, 72, 72, 150]
const MIN_WIDTH = COLS.reduce((a, b) => a + b, 0)
const ROW_HEIGHT = 56
const HEAD = 'px-3 py-2 text-left align-middle font-display text-[15px] font-bold'

export function InventarioClient({ items, warehouseId }: { items: ItemInventario[]; warehouseId: string }) {
  const router = useRouter()
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditRow | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [open, setOpen] = useState<{ key: ColumnKey; rect: DOMRect } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const filtersOn = activeFilterKeys(filters).length > 0
  const tableRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  // The page scrolls (title and tabs go off screen, the table header sticks to the top), so the
  // virtual list needs the table's distance from the top of the page.
  useEffect(() => {
    const measure = () => setScrollMargin((tableRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [erro, filtersOn])

  const toTop = () => { if (window.scrollY > scrollMargin) window.scrollTo({ top: scrollMargin }) }

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
    const numbers = parseInventoryNumbers(edit)
    if ('error' in numbers) { setErro(numbers.error); return }
    startTransition(async () => {
      const result = await editarItemInventario(editingCode, {
        brand_name: edit.brand_name,
        ...numbers,
        category: edit.category,
        category1: edit.category1,
        bins: edit.bins.map((b) => b.trim()).filter(Boolean),
      }, warehouseId)
      if (result.error) {
        setErro(result.error)
      } else {
        setEditingCode(null)
        setEdit(null)
        router.refresh()
      }
    })
  }

  function toggleStatus(item: ItemInventario) {
    setErro(null)
    startTransition(async () => {
      const result = await alterarStatusItem(item.brand_code, !item.brand_active, warehouseId)
      if (result.error) setErro(result.error)
      else router.refresh()
    })
  }

  // Picking an existing code in the new-product window opens that row for editing instead.
  function editExisting(code: string) {
    const item = items.find((i) => i.brand_code === code)
    setCreating(false)
    if (!item) return
    setFilters({ ...EMPTY_FILTERS, selected: { brand_code: new Set([code]) } })
    startEdit(item)
  }

  const shown = useMemo(() => applyFilters(items, filters), [items, filters])
  const closeFilter = useCallback(() => setOpen(null), [])
  const anyActive = filtersOn || filters.sort !== null
  const openValues = useMemo(() => (open ? distinctValues(items, filters, open.key) : []), [open, items, filters])
  const virtualizer = useWindowVirtualizer({
    count: shown.length,
    scrollMargin,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })
  const rows = virtualizer.getVirtualItems()
  // Header label (as in the spreadsheet) with its filter button on the same line; sorted columns show the direction.
  function header(key: ColumnKey, label: string, fullLabel = label) {
    const filtered = filters.selected[key] !== undefined
    const sorted = filters.sort?.key === key ? filters.sort.dir : null
    return (
      <div className="flex items-center justify-between gap-1">
        <span className="min-w-0 leading-tight">{label}{sorted && <span className="ml-1 text-on-ink-2" aria-label={sorted === 'asc' ? 'sorted ascending' : 'sorted descending'}>{sorted === 'asc' ? '↑' : '↓'}</span>}</span>
        <button type="button" data-filter-button aria-label={`Filter ${fullLabel}`} aria-haspopup="dialog" aria-expanded={open?.key === key}
          onClick={(e) => setOpen(open?.key === key ? null : { key, rect: e.currentTarget.getBoundingClientRect() })}
          className={'inline-flex size-7 shrink-0 items-center justify-center rounded-sm focus-visible:outline-3 focus-visible:outline-info ' + (filtered ? 'bg-accent text-white' : open?.key === key ? 'bg-ground text-ink' : 'text-on-ink-2 hover:bg-ink-2 hover:text-white')}>
          <Icon name="filter" size={15} />
        </button>
      </div>
    )
  }
  const padTop = rows.length ? rows[0].start - scrollMargin : 0
  const padBottom = rows.length ? virtualizer.getTotalSize() - (rows[rows.length - 1].end - scrollMargin) : 0
  const cell = 'px-3 py-1'
  const ecell = 'px-1.5 py-1'
  const clip = 'block truncate'
  const none = <span className="text-ink-3">—</span>
  const text = (v: string | number) => v === '' || v === 0 ? none : <span className={clip} title={String(v)}>{v}</span>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-10 flex-wrap items-center gap-3">
        <span className="text-[15px] text-ink-2">{filtersOn ? `${shown.length} of ${items.length} products` : `${items.length} products`}</span>
        <button type="button" onClick={() => setCreating(true)} className={buttonClass('dark', 'sm')}><Icon name="plus" size={16} />New product</button>
        {anyActive && <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setOpen(null); toTop() }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border-2 border-ink bg-surface px-3 font-display text-[15px] font-bold"><Icon name="close" size={16} />Clear all filters</button>}
      </div>
      {erro && <p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-[15px] font-medium text-white">{erro}</p>}
      <div ref={tableRef} data-testid="inventory-table" className="rounded-md border border-line bg-surface">
        <table className="w-full table-fixed border-collapse text-[15px]" style={{ minWidth: MIN_WIDTH }}>
          <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead className="sticky top-0 z-10 bg-ink text-ground">
            <tr>
              {COLUMNS.slice(0, 8).map((c) => <th key={c.key} rowSpan={2} className={HEAD}>{header(c.key, c.label)}</th>)}
              <th colSpan={4} className={HEAD + ' border-b border-l border-ink-2 !py-1.5'}>BIN Location</th>
              <th rowSpan={2} className={HEAD}><span className="sr-only">Actions</span></th>
            </tr>
            <tr>
              {COLUMNS.slice(8).map((c, i) => <th key={c.key} className={HEAD + ' !py-1.5' + (i === 0 ? ' border-l border-ink-2' : '')}>{header(c.key, String(i + 1), c.label)}</th>)}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }} />}
            {rows.map((vr) => {
              const item = shown[vr.index]
              const isEditing = editingCode === item.brand_code && edit !== null
              return (
                <tr key={item.brand_code} style={{ height: ROW_HEIGHT }} className={'border-t border-ground-2 ' + (isEditing ? 'bg-ground' : '')}>
                  <td className={cell}>
                    <button type="button" role="switch" aria-checked={item.brand_active} aria-label={'Status ' + item.brand_code}
                      disabled={isPending} onClick={() => toggleStatus(item)} className="min-h-10 rounded-sm focus-visible:outline-3 focus-visible:outline-info disabled:opacity-60">
                      {item.brand_active ? <Tag tone="ok">Active</Tag> : <Tag tone="neutral">Inactive</Tag>}
                    </button>
                  </td>
                  <td className={cell + ' font-mono text-[13px] font-semibold text-ink-2'}>{text(item.brand_code)}</td>
                  {isEditing && edit ? (
                    <>
                      <td className={ecell}><input aria-label="Brand Name" className={inp} value={edit.brand_name} onChange={(e) => setField('brand_name', e.target.value)} /></td>
                      <td className={ecell}><input aria-label="Category" className={inp} value={edit.category} onChange={(e) => setField('category', e.target.value)} /></td>
                      <td className={ecell}><input aria-label="Category1" className={inp} value={edit.category1} onChange={(e) => setField('category1', e.target.value)} /></td>
                      <td className={ecell}><input aria-label="BPU" className={inp + ' text-right'} inputMode="numeric" value={edit.bpu} onChange={(e) => setField('bpu', e.target.value)} /></td>
                      <td className={ecell}><input aria-label="Pallet Size" className={inp + ' text-right'} inputMode="numeric" value={edit.pallet_size} onChange={(e) => setField('pallet_size', e.target.value)} /></td>
                      <td className={ecell}><input aria-label="Weight AVG" className={inp + ' text-right'} inputMode="decimal" value={edit.weight_avg} onChange={(e) => setField('weight_avg', e.target.value)} /></td>
                      {([0, 1, 2, 3] as const).map((i) => (
                        <td key={i} className={ecell}><input aria-label={`BIN ${i + 1}`} className={inp + ' font-mono ' + (edit.bins[i] ? 'bg-line' : 'border-dashed border-line-2')} value={edit.bins[i]} onChange={(e) => setBin(i, e.target.value)} placeholder={`BIN ${i + 1}`} /></td>
                      ))}
                      <td className="px-2 py-1 text-right">
                        <span className="inline-flex items-center gap-1">
                          <button type="button" onClick={cancel} disabled={isPending} className="min-h-10 px-1.5 text-sm font-semibold underline underline-offset-4">Cancel</button>
                          <button type="button" onClick={save} disabled={isPending} className={buttonClass('dark', 'sm') + ' !px-3'}>{isPending ? 'Saving' : 'Save'}</button>
                        </span>
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
      {creating && <NewProductDialog warehouseId={warehouseId} onClose={() => setCreating(false)}
        onCreated={() => { setCreating(false); router.refresh() }} onEditExisting={editExisting} />}
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
            toTop()
          }}
          onSort={(dir) => { setFilters((f) => ({ ...f, sort: { key: open.key, dir } })); setOpen(null); toTop() }} />
      )}
    </div>
  )
}
