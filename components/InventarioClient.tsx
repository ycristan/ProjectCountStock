'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemInventario } from '@/actions/inventario'
import { editarItemInventario } from '@/actions/inventario'
import { filterItems } from '@/lib/inventory-search'
import { buttonClass } from '@/components/ui'
import { Icon } from '@/components/icons'

const inp = 'min-h-10 rounded-md border-2 border-ink bg-surface px-2 text-[15px] outline-none focus-visible:outline-3 focus-visible:outline-info'

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

export function InventarioClient({ items }: { items: ItemInventario[] }) {
  const router = useRouter()
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditRow | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [isPending, startTransition] = useTransition()

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

  const shown = query.trim() ? filterItems(items, query) : items
  const head = 'whitespace-nowrap px-3 py-2.5 font-display text-[13px] font-bold uppercase tracking-[0.08em]'
  const cell = 'px-3 py-2.5'
  const none = <span className="text-ink-3">—</span>
  const big = 'font-display text-xl font-bold'

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-12 items-center gap-2 rounded-md border-2 border-ink bg-surface px-3 focus-within:outline-3 focus-within:outline-info">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span className="sr-only">Search products</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Code, name or BIN"
          className="min-w-0 flex-grow bg-transparent text-base outline-none placeholder:text-ink-3" />
      </label>
      {query.trim() && <span className="text-sm text-ink-2">{shown.length} of {items.length} products</span>}
      {erro && <p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-[15px] font-medium text-white">{erro}</p>}
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full min-w-[960px] border-collapse text-[15px]">
          <thead>
            <tr className="bg-ink text-left text-ground">
              <th className={head}>Product</th><th className={head}>Category</th><th className={head}>Category1</th>
              <th className={head + ' text-right'}>BPU</th><th className={head + ' text-right'}>Pallet</th>
              <th className={head + ' text-right'}>W.AVG g</th><th className={head}>BINs</th>
              <th className={head}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => {
              const isEditing = editingCode === item.brand_code && edit !== null
              return (
                <tr key={item.brand_code} className={'border-t border-ground-2 ' + (isEditing ? 'bg-[#FFFBEA]' : '')}>
                  {isEditing && edit ? (
                    <>
                      <td className={cell}><span className="font-mono text-[13px] font-semibold text-ink-2">{item.brand_code}</span><br />
                        <input aria-label="Brand Name" className={inp + ' mt-1 min-w-[180px]'} value={edit.brand_name} onChange={(e) => setField('brand_name', e.target.value)} /></td>
                      <td className={cell}><input aria-label="Category" className={inp + ' min-w-[110px]'} value={edit.category} onChange={(e) => setField('category', e.target.value)} /></td>
                      <td className={cell}><input aria-label="Category1" className={inp + ' min-w-[110px]'} value={edit.category1} onChange={(e) => setField('category1', e.target.value)} /></td>
                      <td className={cell + ' text-right'}><input aria-label="BPU" className={inp + ' w-20 text-right'} type="number" min="0" value={edit.bpu} onChange={(e) => setField('bpu', e.target.value)} /></td>
                      <td className={cell + ' text-right'}><input aria-label="Pallet" className={inp + ' w-20 text-right'} type="number" min="0" value={edit.pallet_size} onChange={(e) => setField('pallet_size', e.target.value)} /></td>
                      <td className={cell + ' text-right'}><input aria-label="W.AVG g" className={inp + ' w-20 text-right'} type="number" min="0" step="0.01" value={edit.weight_avg} onChange={(e) => setField('weight_avg', e.target.value)} /></td>
                      <td className={cell}>
                        <div className="flex gap-1">
                          {([0,1,2,3] as const).map((i) => (
                            <input key={i} aria-label={`BIN ${i+1}`} className={inp + ' w-24 font-mono ' + (edit.bins[i] ? 'bg-safety' : 'border-dashed border-line-2')} value={edit.bins[i]} onChange={(e) => setBin(i, e.target.value)} placeholder={`BIN ${i+1}`} />
                          ))}
                        </div>
                      </td>
                      <td className={cell + ' whitespace-nowrap text-right'}>
                        <button type="button" onClick={cancel} disabled={isPending} className="min-h-10 px-2 text-sm font-semibold underline underline-offset-4">Cancel</button>
                        <button type="button" onClick={save} disabled={isPending} className={buttonClass('dark', 'sm')}><Icon name="check" />{isPending ? '...' : 'Save'}</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={cell + ' max-w-[260px]'}><span className="font-mono text-[13px] font-semibold text-ink-2">{item.brand_code}</span><br /><strong className="block truncate">{item.brand_name}</strong></td>
                      <td className={cell + ' text-ink-2'}>{item.category || none}</td>
                      <td className={cell + ' text-ink-2'}>{item.category1 || none}</td>
                      <td className={cell + ' text-right'}>{item.bpu ? <span className={big}>{item.bpu}</span> : none}</td>
                      <td className={cell + ' text-right'}>{item.pallet_size ? <span className={big}>{item.pallet_size}</span> : none}</td>
                      <td className={cell + ' text-right'}>{Number(item.weight_avg) > 0 ? <span className={big}>{item.weight_avg} g</span> : none}</td>
                      <td className={cell}>{item.bins.length > 0
                        ? <span className="flex flex-wrap gap-1">{item.bins.map(b => <span key={b} className="rounded-sm border-[1.5px] border-ink bg-safety px-1.5 py-0.5 font-mono text-[13px] font-semibold">{b}</span>)}</span>
                        : <span className="text-sm font-semibold text-alert">No BIN</span>}</td>
                      <td className={cell + ' text-right'}>
                        <button type="button" onClick={() => startEdit(item)} aria-label={'Edit ' + item.brand_code} className={buttonClass('outline', 'sm')}><Icon name="edit" />Edit</button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[15px] text-ink-2">
                  {items.length ? 'No products match this search.' : 'No items in inventory. Import an .xlsx file.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
