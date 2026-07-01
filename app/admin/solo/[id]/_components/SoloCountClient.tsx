'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { lancarSoloContagem, encerrarSoloSessao } from '@/actions/solo'

type InvItem = {
  brand_code: string
  brand_name: string
  bpu: number
  pallet_size: number
}

type Entry = {
  brand_code: string
  brand_name: string
  final_cases: number
  final_units: number
}

type Props = {
  sessionId: string
  title: string
  status: string
  inventory: InvItem[]
  initialEntries: Entry[]
}

export function SoloCountClient({ sessionId, title, status: initialStatus, inventory, initialEntries }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<Record<string, Entry>>(
    Object.fromEntries(initialEntries.map((e) => [e.brand_code, e])),
  )
  const [selected, setSelected] = useState<InvItem | null>(null)
  const [pallets, setPallets] = useState('0')
  const [cases, setCases] = useState('0')
  const [units, setUnits] = useState('0')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [finalising, startFinalise] = useTransition()
  const router = useRouter()

  const isOpen = status === 'open'

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
    setUnits(!existing ? '0' : noBpu ? String(existing.final_cases + existing.final_units) : String(existing.final_units))
    setErro(null)
    setSelected(item)
  }

  function handleSubmit() {
    if (!selected) return
    setErro(null)
    const bpu = selected.bpu || 1
    const noBpu = selected.bpu === 1
    const noPallets = !selected.pallet_size
    const p = noPallets || noBpu ? 0 : Math.max(0, parseInt(pallets) || 0)
    const c = noBpu ? 0 : Math.max(0, parseInt(cases) || 0)
    const u = Math.max(0, parseInt(units) || 0)
    const total = p * selected.pallet_size * bpu + c * bpu + u
    const final_cases = Math.floor(total / bpu)
    const final_units = total % bpu

    startTransition(async () => {
      const res = await lancarSoloContagem(sessionId, selected.brand_code, selected.brand_name, final_cases, final_units)
      if (res.error) { setErro(res.error); return }
      setEntries((prev) => ({
        ...prev,
        [selected.brand_code]: { brand_code: selected.brand_code, brand_name: selected.brand_name, final_cases, final_units },
      }))
      setSelected(null)
      setQuery('')
    })
  }

  function handleFinalise() {
    startFinalise(async () => {
      const res = await encerrarSoloSessao(sessionId)
      if (!res.error) { setStatus('closed'); router.refresh() }
    })
  }

  const counted = Object.values(entries).sort((a, b) => a.brand_code.localeCompare(b.brand_code))

  // ── Count form (item selected) ──
  if (selected) {
    const bpu = selected.bpu || 1
    const noBpu = selected.bpu === 1
    const noPallets = !selected.pallet_size
    const existing = entries[selected.brand_code]
    const p = noPallets || noBpu ? 0 : Math.max(0, parseInt(pallets) || 0)
    const c = noBpu ? 0 : Math.max(0, parseInt(cases) || 0)
    const u = Math.max(0, parseInt(units) || 0)
    const total = p * selected.pallet_size * bpu + c * bpu + u
    const previewCases = Math.floor(total / bpu)
    const previewUnits = total % bpu
    const fields = [
      { label: 'Pallets', value: pallets, set: setPallets, disabled: noPallets || noBpu },
      { label: 'Cases', value: cases, set: setCases, disabled: noBpu },
      { label: 'Units', value: units, set: setUnits, disabled: false },
    ]

    return (
      <div className="max-w-md mx-auto space-y-4">
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

        {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>}

        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full bg-slate-900 text-white font-semibold py-4 rounded-xl disabled:opacity-40"
        >
          {isPending ? 'Saving...' : 'Confirm Count'}
        </button>
        <button
          onClick={() => { setSelected(null); setErro(null) }}
          className="w-full text-slate-500 text-sm py-3 rounded-xl border border-slate-200 bg-white"
        >
          ← Back to Search
        </button>
      </div>
    )
  }

  // ── Search + counted list ──
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/admin/solo" className="text-slate-400 hover:text-slate-900 text-sm">← Solo Count</Link>
          <span className="text-slate-300">/</span>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${isOpen ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/solo/${sessionId}/export`}
            className="text-sm font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl px-4 py-2"
          >
            ↓ Export Excel
          </a>
          {isOpen && (
            <button
              onClick={handleFinalise}
              disabled={finalising}
              className="text-sm font-semibold bg-slate-900 text-white rounded-xl px-4 py-2 hover:bg-slate-700 disabled:opacity-40"
            >
              {finalising ? '...' : 'Finalise Solo Count'}
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by brand code or name..."
            autoFocus
            className="w-full rounded-xl px-4 py-3 text-sm border border-slate-200 focus:outline-none focus:border-slate-900"
          />
          {results.length > 0 && (
            <div className="mt-2 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
              {results.map((item) => {
                const c = entries[item.brand_code]
                return (
                  <button
                    key={item.brand_code}
                    onClick={() => selectItem(item)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                      c ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-500">{item.brand_code}</div>
                      <div className="font-semibold text-slate-900 text-sm">{item.brand_name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">BPU: {item.bpu} · Pallet: {item.pallet_size}</div>
                    </div>
                    {c ? (
                      <span className="flex-shrink-0 text-xs font-bold bg-green-100 text-green-700 rounded-full px-3 py-1 whitespace-nowrap">
                        ✓ {c.final_cases}cs {c.final_units}un
                      </span>
                    ) : (
                      <span className="flex-shrink-0 text-xs text-slate-400 bg-slate-100 rounded-full px-3 py-1">Count →</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-900">{counted.length} items counted</h3>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand Name</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cases</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Units</th>
              {isOpen && <th className="w-16" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {counted.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">No items counted yet.</td></tr>
            ) : (
              counted.map((e) => {
                const inv = inventory.find((i) => i.brand_code === e.brand_code)
                return (
                  <tr key={e.brand_code} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-700">{e.brand_code}</td>
                    <td className="px-4 py-3 text-slate-600">{e.brand_name}</td>
                    <td className="px-4 py-3 text-center font-mono">{e.final_cases}</td>
                    <td className="px-4 py-3 text-center font-mono">{e.final_units}</td>
                    {isOpen && (
                      <td className="px-4 py-3 text-center">
                        {inv && (
                          <button onClick={() => selectItem(inv)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
