'use client'

import { useState, useTransition, useMemo } from 'react'
import { lancarSoloContagem } from '@/actions/solo'

type InvItem = {
  brand_code: string
  brand_name: string
  bpu: number
  pallet_size: number
  category: string | null
  category1: string | null
}

type Entry = {
  brand_code: string
  final_cases: number
  final_units: number
}

type Props = {
  sessionTitle: string
  counterName?: string
  inventory: InvItem[]
  initialEntries: Entry[]
}

export function SoloBuscaClient({ sessionTitle, counterName, inventory, initialEntries }: Props) {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<Record<string, Entry>>(
    Object.fromEntries(initialEntries.map((e) => [e.brand_code, e]))
  )
  const [selected, setSelected] = useState<InvItem | null>(null)
  const [pallets, setPallets] = useState('0')
  const [cases, setCases] = useState('0')
  const [units, setUnits] = useState('0')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const results = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return []
    return inventory
      .filter((i) => i.brand_code.toUpperCase().startsWith(q) || i.brand_name.toUpperCase().includes(q))
      .slice(0, 20)
  }, [query, inventory])

  function selectItem(item: InvItem) {
    const existing = entries[item.brand_code]
    const noBpu = item.bpu === 1
    setPallets('0')
    setCases(!existing || noBpu ? '0' : String(existing.final_cases))
    setUnits(
      !existing ? '0'
      : noBpu ? String(existing.final_cases + existing.final_units)
      : String(existing.final_units)
    )
    setErro(null)
    setSelected(item)
  }

  function handleBack() {
    setSelected(null)
    setErro(null)
  }

  function handleSubmit() {
    if (!selected) return
    setErro(null)
    const noBpu = selected.bpu === 1
    const noPallets = !selected.pallet_size
    const p = noPallets || noBpu ? 0 : Math.max(0, parseInt(pallets) || 0)
    const c = noBpu ? 0 : Math.max(0, parseInt(cases) || 0)
    const u = Math.max(0, parseInt(units) || 0)
    const total = p * selected.pallet_size * selected.bpu + c * selected.bpu + u
    const final_cases = selected.bpu > 0 ? Math.floor(total / selected.bpu) : 0
    const final_units = selected.bpu > 0 ? total % selected.bpu : 0

    startTransition(async () => {
      const res = await lancarSoloContagem(selected.brand_code, selected.brand_name, final_cases, final_units)
      if (res.error) { setErro(res.error); return }
      setEntries((prev) => ({ ...prev, [selected.brand_code]: { brand_code: selected.brand_code, final_cases, final_units } }))
      setSelected(null)
      setQuery('')
    })
  }

  const countedTotal = Object.keys(entries).length

  if (selected) {
    const noBpu = selected.bpu === 1
    const noPallets = !selected.pallet_size
    const existing = entries[selected.brand_code]
    const p = noPallets || noBpu ? 0 : Math.max(0, parseInt(pallets) || 0)
    const c = noBpu ? 0 : Math.max(0, parseInt(cases) || 0)
    const u = Math.max(0, parseInt(units) || 0)
    const total = p * selected.pallet_size * selected.bpu + c * selected.bpu + u
    const previewCases = selected.bpu > 0 ? Math.floor(total / selected.bpu) : 0
    const previewUnits = selected.bpu > 0 ? total % selected.bpu : 0

    const fields = [
      { label: 'Pallets', value: pallets, set: setPallets, disabled: noPallets || noBpu },
      { label: 'Cases', value: cases, set: setCases, disabled: noBpu },
      { label: 'Units', value: units, set: setUnits, disabled: false },
    ]

    return (
      <div className="min-h-screen bg-slate-50">
        <header className="sticky top-0 z-10 bg-slate-900 px-4 py-3 flex items-center gap-3">
          <button onClick={handleBack} className="text-slate-400 hover:text-white text-sm flex-shrink-0">← Back</button>
          <span className="text-white font-bold text-sm truncate">{sessionTitle}</span>
        </header>
        <div className="max-w-sm mx-auto p-4 space-y-4">
          <div className="rounded-xl p-4 bg-slate-900 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Selected Item</div>
            <div className="text-xl font-bold mt-1">{selected.brand_code}</div>
            <div className="text-sm text-slate-300">{selected.brand_name}</div>
            <div className="text-xs text-slate-400 mt-1">BPU: {selected.bpu} · Pallet: {selected.pallet_size}</div>
          </div>

          {existing && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Previously counted: <strong>{existing.final_cases}cs {existing.final_units}un</strong> — submitting will replace.
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {fields.map(({ label, value, set, disabled }) => (
              <div key={label} className="text-center">
                <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${disabled ? 'text-slate-300' : 'text-slate-500'}`}>
                  {label}
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  value={value}
                  onChange={(e) => { set(e.target.value); setErro(null) }}
                  disabled={disabled}
                  className={`w-full text-center text-2xl font-bold px-1 py-3 rounded-xl border-[1.5px] focus:outline-none ${
                    disabled
                      ? 'border-slate-100 bg-slate-100 text-slate-300 cursor-not-allowed'
                      : 'border-slate-200 bg-white focus:border-blue-500'
                  }`}
                />
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-slate-900 p-4 text-white flex justify-between items-center">
            <span className="text-sm text-slate-400">Result</span>
            <span className="text-2xl font-bold">{previewCases}cs {previewUnits}un</span>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full bg-slate-900 text-white font-semibold py-4 rounded-xl disabled:opacity-40"
          >
            {isPending ? 'Saving...' : 'Confirm Count'}
          </button>
          <button onClick={handleBack} className="w-full text-slate-500 text-sm py-3 rounded-xl border border-slate-200 bg-white">
            ← Back to Search
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-slate-900 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white font-bold text-sm">{sessionTitle}</span>
          {counterName && <span className="text-slate-400 text-xs">{counterName}</span>}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by brand code or name..."
          className="w-full rounded-xl px-4 py-3 text-sm bg-slate-800 text-white placeholder-slate-400 border border-slate-700 focus:outline-none focus:border-slate-500"
          autoFocus
        />
        <div className="text-xs text-slate-500 mt-2 text-right">
          {countedTotal} item{countedTotal !== 1 ? 's' : ''} counted
        </div>
      </header>

      <div className="divide-y divide-slate-100">
        {query.trim() === '' ? (
          <div className="px-4 py-16 text-center text-sm text-slate-400">
            Type a brand code or name to search.
          </div>
        ) : results.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-slate-400">No items found.</div>
        ) : (
          results.map((item) => {
            const counted = entries[item.brand_code]
            return (
              <button
                key={item.brand_code}
                onClick={() => selectItem(item)}
                className={`w-full text-left px-4 py-4 flex items-center justify-between gap-3 transition-colors ${
                  counted ? 'bg-green-50 hover:bg-green-100' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-500">{item.brand_code}</div>
                  <div className="font-semibold text-slate-900 text-sm">{item.brand_name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">BPU: {item.bpu} · Pallet: {item.pallet_size}</div>
                </div>
                {counted ? (
                  <span className="flex-shrink-0 text-xs font-bold bg-green-100 text-green-700 rounded-full px-3 py-1 whitespace-nowrap">
                    ✓ {counted.final_cases}cs {counted.final_units}un
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-xs text-slate-400 bg-slate-100 rounded-full px-3 py-1">Count →</span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
