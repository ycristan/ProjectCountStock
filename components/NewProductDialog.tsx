'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { buscarCodigos, criarItemInventario, type CodigoExistente } from '@/actions/inventario'
import { Label, Notice, Tag, buttonClass, inputClass } from '@/components/ui'

const EMPTY = { brand_code: '', brand_name: '', category: '', category1: '', bpu: '', pallet_size: '', weight_avg: '', bins: ['', '', '', ''] }
type Form = typeof EMPTY
type TextKey = Exclude<keyof Form, 'bins'>

// Manual creation in the active tab's warehouse (INVENTORY_WAREHOUSES.md §1–2). While the code is typed,
// existing products with that start are listed, inactive included, so nobody creates a second one.
export function NewProductDialog({ warehouseId, onClose, onCreated, onEditExisting }: {
  warehouseId: string
  onClose: () => void
  onCreated: () => void
  onEditExisting: (code: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [matches, setMatches] = useState<CodigoExistente[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const code = form.brand_code.trim()

  useEffect(() => { ref.current?.showModal() }, [])
  useEffect(() => {
    let stale = false
    const t = setTimeout(async () => {
      const found = code ? await buscarCodigos(code) : []
      if (!stale) setMatches(found)
    }, 250)
    return () => { stale = true; clearTimeout(t) }
  }, [code])

  const exact = matches.find((m) => m.brand_code === code)
  const set = (key: TextKey, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const setBin = (i: number, value: string) => setForm((f) => ({ ...f, bins: f.bins.map((b, j) => (j === i ? value : b)) }))

  function create() {
    setErro(null)
    startTransition(async () => {
      const result = await criarItemInventario(code, {
        brand_name: form.brand_name, category: form.category, category1: form.category1,
        bpu: Number(form.bpu) || 0, pallet_size: Number(form.pallet_size) || 0, weight_avg: Number(form.weight_avg) || 0,
        bins: form.bins.map((b) => b.trim()).filter(Boolean),
      }, warehouseId)
      if (result.error) setErro(result.error)
      else onCreated()
    })
  }

  const field = (key: TextKey, label: string, numeric = false) => (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      <input className={inputClass + (numeric ? ' text-right' : '')} value={form[key]} onChange={(e) => set(key, e.target.value)}
        type={numeric ? 'number' : 'text'} min={numeric ? 0 : undefined} step={key === 'weight_avg' ? '0.01' : undefined} />
    </label>
  )

  return (
    <dialog ref={ref} aria-labelledby="new-product-title" onCancel={(e) => { e.preventDefault(); onClose() }}
      className="m-auto max-h-[92vh] w-[min(94vw,640px)] overflow-y-auto rounded-md border-2 border-ink bg-surface p-5 text-ink backdrop:bg-ink/60">
      <h2 id="new-product-title" className="m-0 mb-4 font-display text-2xl font-bold uppercase">New product</h2>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (!exact) create() }}>
        <label className="flex flex-col gap-1">
          <Label>Brand Code</Label>
          <input autoFocus className={inputClass + ' font-mono'} value={form.brand_code} onChange={(e) => set('brand_code', e.target.value)} autoComplete="off" />
        </label>
        {matches.length > 0 && (
          <ul aria-label="Existing Brand Codes" className="m-0 flex list-none flex-col gap-1 rounded-md border border-line p-2">
            {matches.map((m) => (
              <li key={m.brand_code} className="flex min-h-10 items-center gap-2 text-[15px]">
                <span className="font-mono font-semibold">{m.brand_code}</span>
                <span className="min-w-0 flex-1 truncate">{m.brand_name}</span>
                <span className="text-ink-2">{m.warehouse}</span>
                {m.brand_active ? <Tag tone="ok">Active</Tag> : <Tag tone="neutral">Inactive</Tag>}
                {m.warehouse_id === warehouseId &&
                  <button type="button" onClick={() => onEditExisting(m.brand_code)} className={buttonClass('outline', 'sm')}>Edit</button>}
              </li>
            ))}
          </ul>
        )}
        {exact && <Notice tone="warn">{exact.warehouse_id === warehouseId
          ? `Brand Code ${exact.brand_code} already exists in this warehouse. Edit it instead${exact.brand_active ? '' : ', or switch its Status to Active'}.`
          : `Brand Code ${exact.brand_code} already exists in ${exact.warehouse}. Moving products between warehouses is not available yet.`}</Notice>}
        <div className="grid gap-3 sm:grid-cols-3">
          {field('brand_name', 'Brand Name')}
          {field('category', 'Category')}
          {field('category1', 'Category1')}
          {field('bpu', 'BPU', true)}
          {field('pallet_size', 'Pallet Size', true)}
          {field('weight_avg', 'Weight AVG', true)}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {form.bins.map((b, i) => (
            <label key={i} className="flex flex-col gap-1">
              <Label>{'BIN ' + (i + 1)}</Label>
              <input className={inputClass + ' font-mono'} value={b} onChange={(e) => setBin(i, e.target.value)} />
            </label>
          ))}
        </div>
        {erro && <Notice>{erro}</Notice>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={buttonClass('outline')} onClick={onClose}>Cancel</button>
          <button type="submit" className={buttonClass('primary')} disabled={isPending || !!exact}>{isPending ? 'Saving' : 'Create product'}</button>
        </div>
      </form>
    </dialog>
  )
}
