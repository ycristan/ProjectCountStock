'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemInventario } from '@/actions/inventario'
import { editarItemInventario } from '@/actions/inventario'

const inp = 'border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:border-blue-500'

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

  return (
    <div>
      {erro && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {erro}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              {['Brand Code','Brand Name','Category','Category1','BPU','Pallet','W.AVG g','BINs',''].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const isEditing = editingCode === item.brand_code && edit !== null
              return (
                <tr key={item.brand_code} className={isEditing ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{item.brand_code}</td>
                  {isEditing && edit ? (
                    <>
                      <td className="px-4 py-2"><input className={`${inp} min-w-[180px]`} value={edit.brand_name} onChange={(e) => setField('brand_name', e.target.value)} /></td>
                      <td className="px-4 py-2"><input className={`${inp} min-w-[110px]`} value={edit.category} onChange={(e) => setField('category', e.target.value)} /></td>
                      <td className="px-4 py-2"><input className={`${inp} min-w-[110px]`} value={edit.category1} onChange={(e) => setField('category1', e.target.value)} /></td>
                      <td className="px-4 py-2"><input className={`${inp} w-16`} type="number" min="0" value={edit.bpu} onChange={(e) => setField('bpu', e.target.value)} /></td>
                      <td className="px-4 py-2"><input className={`${inp} w-16`} type="number" min="0" value={edit.pallet_size} onChange={(e) => setField('pallet_size', e.target.value)} /></td>
                      <td className="px-4 py-2"><input className={`${inp} w-16`} type="number" min="0" step="0.01" value={edit.weight_avg} onChange={(e) => setField('weight_avg', e.target.value)} /></td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          {([0,1,2,3] as const).map((i) => (
                            <input key={i} className={`${inp} w-20`} value={edit.bins[i]} onChange={(e) => setBin(i, e.target.value)} placeholder={`BIN ${i+1}`} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button onClick={save} disabled={isPending} className="px-3 py-1 bg-slate-900 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                            {isPending ? '...' : 'Salvar'}
                          </button>
                          <button onClick={cancel} disabled={isPending} className="px-3 py-1 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100">
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 text-slate-900 max-w-[200px] truncate">{item.brand_name}</td>
                      <td className="px-4 py-2 text-slate-600">{item.category || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-2 text-slate-600">{item.category1 || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-2 text-slate-600">{item.bpu || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-2 text-slate-600">{item.pallet_size || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-2 text-slate-600">{Number(item.weight_avg) > 0 ? item.weight_avg : <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap">{item.bins.length > 0 ? item.bins.join(', ') : <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <button onClick={() => startEdit(item)} className="px-3 py-1 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100">
                          Editar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-sm">
                  Nenhum item no inventário. Faça o upload de um arquivo .xlsx.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
