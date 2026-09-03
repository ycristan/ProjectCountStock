'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CamposInventario, ItemInventario } from '@/actions/inventario'
import { criarItemInventario, editarItemInventario } from '@/actions/inventario'

const inp = 'border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:border-blue-500'
const emptyBins: [string, string, string, string] = ['', '', '', '']

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

function fieldsFromEdit(edit: EditRow): CamposInventario {
  return {
    brand_name: edit.brand_name,
    bpu: Number(edit.bpu),
    pallet_size: Number(edit.pallet_size),
    weight_avg: Number(edit.weight_avg),
    category: edit.category,
    category1: edit.category1,
    bins: edit.bins.filter(Boolean),
  }
}

function NewItemForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [brandCode, setBrandCode] = useState('')
  const [edit, setEdit] = useState<EditRow>({
    brand_name: '',
    bpu: '',
    pallet_size: '',
    weight_avg: '',
    category: '',
    category1: '',
    bins: emptyBins,
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function setField(field: keyof Omit<EditRow, 'bins'>, value: string) {
    setEdit((prev) => ({ ...prev, [field]: value }))
  }

  function setBin(index: 0 | 1 | 2 | 3, value: string) {
    setEdit((prev) => {
      const bins = [...prev.bins] as [string, string, string, string]
      bins[index] = value
      return { ...prev, bins }
    })
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await criarItemInventario(brandCode, fieldsFromEdit(edit))
      if (result.error) {
        setError(result.error)
        return
      }
      onSaved()
    })
  }

  return (
    <form onSubmit={save} className="mb-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-slate-900">Add product</h3>
          <p className="mt-1 text-xs text-slate-500">
            It will start as Active. A later .xlsx upload that does not include it will mark it as Inactive.
          </p>
        </div>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-800">Cancel</button>
      </div>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-slate-700">Brand Code<input required className={`${inp} mt-1 block w-full`} value={brandCode} onChange={(e) => setBrandCode(e.target.value)} /></label>
        <label className="text-sm text-slate-700">Brand Name<input required className={`${inp} mt-1 block w-full`} value={edit.brand_name} onChange={(e) => setField('brand_name', e.target.value)} /></label>
        <label className="text-sm text-slate-700">Category<input className={`${inp} mt-1 block w-full`} value={edit.category} onChange={(e) => setField('category', e.target.value)} /></label>
        <label className="text-sm text-slate-700">Category1<input className={`${inp} mt-1 block w-full`} value={edit.category1} onChange={(e) => setField('category1', e.target.value)} /></label>
        <label className="text-sm text-slate-700">BPU<input required type="number" min="1" step="1" className={`${inp} mt-1 block w-full`} value={edit.bpu} onChange={(e) => setField('bpu', e.target.value)} /></label>
        <label className="text-sm text-slate-700">Pallet<input required type="number" min="0" step="1" className={`${inp} mt-1 block w-full`} value={edit.pallet_size} onChange={(e) => setField('pallet_size', e.target.value)} /></label>
        <label className="text-sm text-slate-700">W.AVG g<input required type="number" min="0" step="0.01" className={`${inp} mt-1 block w-full`} value={edit.weight_avg} onChange={(e) => setField('weight_avg', e.target.value)} /></label>
      </div>
      <div className="mt-3">
        <div className="text-sm text-slate-700 mb-1">BINs <span className="text-xs text-slate-400">(up to 4)</span></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {([0, 1, 2, 3] as const).map((index) => <input key={index} className={inp} value={edit.bins[index]} onChange={(e) => setBin(index, e.target.value)} placeholder={`BIN ${index + 1}`} />)}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button disabled={isPending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? 'Adding...' : 'Add product'}</button>
        <button type="button" onClick={onCancel} disabled={isPending} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Cancel</button>
      </div>
    </form>
  )
}

export function InventarioClient({ items, canAdd }: { items: ItemInventario[]; canAdd: boolean }) {
  const router = useRouter()
  const [view, setView] = useState<'active' | 'inactive'>('active')
  const [showCreate, setShowCreate] = useState(false)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditRow | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const activeItems = items.filter((item) => item.brand_active)
  const inactiveItems = items.filter((item) => !item.brand_active)
  const visibleItems = view === 'active' ? activeItems : inactiveItems

  function startEdit(item: ItemInventario) {
    setEditingCode(item.brand_code)
    setEdit(toEdit(item))
    setErro(null)
  }
  function cancelEdit() { setEditingCode(null); setEdit(null); setErro(null) }
  function setField(field: keyof Omit<EditRow, 'bins'>, value: string) { setEdit((prev) => prev ? { ...prev, [field]: value } : prev) }
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
      const result = await editarItemInventario(editingCode, fieldsFromEdit(edit))
      if (result.error) setErro(result.error)
      else { cancelEdit(); router.refresh() }
    })
  }

  return (
    <div>
      {canAdd && !showCreate && <button onClick={() => setShowCreate(true)} className="mb-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">+ Add product</button>}
      {!canAdd && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Products cannot be added while a count session is in progress.</p>}
      {showCreate && <NewItemForm onCancel={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); router.refresh() }} />}
      {erro && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{erro}</div>}
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {([['active', activeItems.length, 'Active'], ['inactive', inactiveItems.length, 'Inactive']] as const).map(([key, count, label]) => <button key={key} onClick={() => { setView(key); cancelEdit() }} className={`border-b-2 px-3 py-2 text-sm font-semibold ${view === key ? key === 'active' ? 'border-emerald-500 text-emerald-700' : 'border-rose-400 text-rose-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label} ({count})</button>)}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-slate-50 border-b border-slate-200 text-left">{['Brand Code','Brand Name','Category','Category1','BPU','Pallet','W.AVG g','BINs',''].map((h) => <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {visibleItems.map((item) => {
              const isEditing = editingCode === item.brand_code && edit !== null
              return <tr key={item.brand_code} className={isEditing ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                <td className="px-4 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{item.brand_code}</td>
                {isEditing && edit ? <><td className="px-4 py-2"><input className={`${inp} min-w-[180px]`} value={edit.brand_name} onChange={(e) => setField('brand_name', e.target.value)} /></td><td className="px-4 py-2"><input className={`${inp} min-w-[110px]`} value={edit.category} onChange={(e) => setField('category', e.target.value)} /></td><td className="px-4 py-2"><input className={`${inp} min-w-[110px]`} value={edit.category1} onChange={(e) => setField('category1', e.target.value)} /></td><td className="px-4 py-2"><input className={`${inp} w-16`} type="number" min="0" value={edit.bpu} onChange={(e) => setField('bpu', e.target.value)} /></td><td className="px-4 py-2"><input className={`${inp} w-16`} type="number" min="0" value={edit.pallet_size} onChange={(e) => setField('pallet_size', e.target.value)} /></td><td className="px-4 py-2"><input className={`${inp} w-16`} type="number" min="0" step="0.01" value={edit.weight_avg} onChange={(e) => setField('weight_avg', e.target.value)} /></td><td className="px-4 py-2"><div className="flex gap-1">{([0,1,2,3] as const).map((i) => <input key={i} className={`${inp} w-20`} value={edit.bins[i]} onChange={(e) => setBin(i, e.target.value)} placeholder={`BIN ${i+1}`} />)}</div></td><td className="px-4 py-2 whitespace-nowrap"><div className="flex gap-2"><button onClick={save} disabled={isPending} className="px-3 py-1 bg-slate-900 text-white text-xs font-semibold rounded-lg disabled:opacity-50">{isPending ? '...' : 'Save'}</button><button onClick={cancelEdit} disabled={isPending} className="px-3 py-1 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100">Cancel</button></div></td></> : <><td className="px-4 py-2 text-slate-900 max-w-[200px] truncate">{item.brand_name}</td><td className="px-4 py-2 text-slate-600">{item.category || <span className="text-slate-300">—</span>}</td><td className="px-4 py-2 text-slate-600">{item.category1 || <span className="text-slate-300">—</span>}</td><td className="px-4 py-2 text-slate-600">{item.bpu || <span className="text-slate-300">—</span>}</td><td className="px-4 py-2 text-slate-600">{item.pallet_size || <span className="text-slate-300">—</span>}</td><td className="px-4 py-2 text-slate-600">{Number(item.weight_avg) > 0 ? item.weight_avg : <span className="text-slate-300">—</span>}</td><td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap">{item.bins.length > 0 ? item.bins.join(', ') : <span className="text-slate-300">—</span>}</td><td className="px-4 py-2 whitespace-nowrap"><button onClick={() => startEdit(item)} className="px-3 py-1 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100">Edit</button></td></>}
              </tr>
            })}
            {visibleItems.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-sm">{view === 'active' ? 'No active products.' : 'No inactive products.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
