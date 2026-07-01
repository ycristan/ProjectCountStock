'use client'

import { useState, useTransition } from 'react'
import type { ItemBusca, LancarContagemPayload, LancarContagemResult } from '@/actions/contagem'
import { lancarContagem } from '@/actions/contagem'

type SucessoResult = {
  final_cases: number
  final_units: number
  brand_name: string
}

type Props = {
  item: ItemBusca
  onVoltar: () => void
  onSucesso: (result: SucessoResult) => void
  isAdditive?: boolean
  // ponytail: solo count injeta seu próprio submit; padrão é o fluxo de equipe
  onSubmit?: (payload: LancarContagemPayload) => Promise<LancarContagemResult>
}

type Rodada = { id: number; caixas: string; pesoFmt: string }

function parseGrams(fmt: string): number {
  return parseInt(fmt.replace(/\D/g, '') || '0', 10)
}

function formatGrams(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const num = parseInt(digits || '0', 10)
  return num === 0 ? '' : num.toLocaleString('en-GB')
}

// ponytail: derived from value, no extra state
function isNeg(v: string) {
  return (parseInt(v) || 0) < 0
}

export function CountForm({ item, onVoltar, onSucesso, isAdditive = false, onSubmit }: Props) {
  const entry = item.entryExistente
  const isEdit = !!entry && !isAdditive
  // ponytail: pallet_size=0 → item has no pallets, field locked at 0
  const noPallets = !item.pallet_size
  // ponytail: bpu=1 → 1cs=1un, no distinction between cases and units
  const noBpu = item.bpu === 1

  const [modo, setModo] = useState<'normal' | 'peso'>('normal')
  const [rodadas, setRodadas] = useState<Rodada[]>([{ id: 0, caixas: '', pesoFmt: '' }])
  const [extraCases, setExtraCases] = useState(0)
  const [pallets, setPallets] = useState(isAdditive || noPallets || noBpu ? '0' : String(entry?.pallets ?? 0))
  const [cases, setCases] = useState(isAdditive || noBpu ? '0' : String(entry?.cases ?? 0))
  // ponytail: edit + bpu=1 → collapse existing cases+units into units (bpu=1 normalises all to final_cases)
  const [units, setUnits] = useState(
    isAdditive ? '0'
    : noBpu ? String((entry?.cases ?? 0) + (entry?.units ?? 0))
    : String(entry?.units ?? 0)
  )
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function switchModo(m: 'normal' | 'peso') {
    setModo(m)
    setExtraCases(0)
  }

  function addRodada() {
    setRodadas((prev) => [...prev, { id: Date.now(), caixas: '', pesoFmt: '' }])
  }

  function removeRodada(id: number) {
    setRodadas((prev) => prev.filter((r) => r.id !== id))
  }

  function updateRodada(id: number, field: 'caixas' | 'pesoFmt', value: string) {
    setRodadas((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        return { ...r, [field]: field === 'pesoFmt' ? formatGrams(value) : value }
      })
    )
  }

  // ponytail: inline — avoids 2 extra reduces vs separate function
  const totalTara = rodadas.reduce((s, r) => s + parseInt(r.caixas || '0', 10) * item.box_tare_g, 0)
  const totalPeso = rodadas.reduce((s, r) => s + parseGrams(r.pesoFmt), 0)
  const liquido = totalPeso - totalTara
  const raw = liquido > 0 && item.weight_avg > 0 ? liquido / item.weight_avg : 0
  const decimal = raw - Math.floor(raw)
  const weightQty = raw > 0 ? (decimal >= 0.7 ? Math.ceil(raw) : Math.floor(raw)) : 0
  const hasWeightData = totalPeso > 0

  // weight + visual cases preview
  const totalWithExtras = weightQty + extraCases * item.bpu
  const previewCases = item.bpu > 0 ? Math.floor(totalWithExtras / item.bpu) : 0
  const previewUnits = item.bpu > 0 ? totalWithExtras % item.bpu : 0

  // additive preview (normal mode) — noPallets: ignore existing pallets
  const addP = Math.max(0, parseInt(pallets) || 0)
  const addC = Math.max(0, parseInt(cases) || 0)
  const addU = Math.max(0, parseInt(units) || 0)
  const sumP = (noPallets ? 0 : (entry?.pallets ?? 0)) + addP
  const sumC = (entry?.cases ?? 0) + addC
  const sumU = (entry?.units ?? 0) + addU
  const totalRaw = sumP * item.pallet_size * item.bpu + sumC * item.bpu + sumU
  const previewAddCases = item.bpu > 0 ? Math.floor(totalRaw / item.bpu) : 0
  const previewAddUnits = item.bpu > 0 ? totalRaw % item.bpu : 0

  const handleSubmit = () => {
    setErro(null)

    let p = 0, c = 0, u = 0
    if (modo === 'peso') {
      if (!hasWeightData) {
        setErro('Enter the weight to calculate the quantity.')
        return
      }
      if (weightQty <= 0) {
        setErro('Insufficient net weight — check the number of boxes.')
        return
      }
      c = extraCases
      u = weightQty
    } else {
      if (isNeg(pallets) || isNeg(cases) || isNeg(units)) {
        setErro('Negative numbers are not permitted.')
        return
      }
      p = Math.max(0, parseInt(pallets) || 0)
      c = Math.max(0, parseInt(cases) || 0)
      u = Math.max(0, parseInt(units) || 0)
      if (isAdditive && entry) {
        p += noPallets ? 0 : entry.pallets
        c += entry.cases
        u += entry.units
      }
    }

    startTransition(async () => {
      try {
        const result = await (onSubmit ?? lancarContagem)({
          brand_code: item.brand_code,
          pallets: p,
          cases: c,
          units: u,
          is_weight_count: modo === 'peso',
        })
        if (result.error) {
          setErro(result.error)
        } else {
          onSucesso({ final_cases: result.final_cases!, final_units: result.final_units!, brand_name: result.brand_name! })
        }
      } catch {
        // ponytail: action ID goes stale after new deploy — Next.js will reload the page
        setErro('Application updated — please close and reopen the app and try again.')
      }
    })
  }

  const btnLabel = isPending
    ? 'Saving...'
    : isAdditive
    ? 'Confirm Addition'
    : isEdit
    ? 'Save Edit'
    : 'Confirm Count'

  return (
    <div>
      <div className="rounded-xl p-4 mb-4 bg-slate-900 text-white">
        <div className="flex items-start justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Selected Item
          </div>
          {isAdditive && (
            <span className="text-[11px] font-semibold bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
              Adding
            </span>
          )}
          {isEdit && (
            <span className="text-[11px] font-semibold bg-amber-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
              Editable
            </span>
          )}
        </div>
        <div className="text-xl font-bold mt-1">{item.brand_code}</div>
        <div className="text-sm text-slate-300">{item.brand_name}</div>
        <div className="text-xs text-slate-400 mt-1">
          {item.bins.length > 0 ? `BIN: ${item.bins.join(', ')} · ` : ''}
          BPU: {item.bpu} · Pallet: {item.pallet_size}
          {item.weight_avg > 0 && ` · ⚖️ ${item.weight_avg}g/unit`}
        </div>
      </div>

      {/* Readonly card of existing count — additive mode only */}
      {isAdditive && entry && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Registered Count
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Pallets', value: entry.pallets },
              { label: 'Cases', value: entry.cases },
              { label: 'Units', value: entry.units },
            ].map(({ label, value }) => (
              <div key={label} className="text-center bg-white border border-slate-200 rounded-xl py-3">
                <div className="text-2xl font-bold text-slate-900">{value}</div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weight mode toggle — hidden in additive mode */}
      {!isAdditive && item.weight_avg > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => switchModo('normal')}
            className={`rounded-xl py-3 text-sm font-semibold border-2 transition-colors ${
              modo === 'normal'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 text-slate-600 bg-white'
            }`}
          >
            🔢 Normal Count
          </button>
          <button
            onClick={() => switchModo('peso')}
            className={`rounded-xl py-3 text-sm font-semibold border-2 transition-colors ${
              modo === 'peso'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 text-slate-600 bg-white'
            }`}
          >
            ⚖️ Count by Weight
          </button>
        </div>
      )}

      {modo === 'normal' && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: isAdditive ? '+ Pallets' : 'Pallets', value: pallets, set: setPallets, disabled: noPallets || noBpu },
              { label: isAdditive ? '+ Cases' : 'Cases', value: cases, set: setCases, disabled: noBpu },
              { label: isAdditive ? '+ Units' : 'Units', value: units, set: setUnits, disabled: false },
            ].map(({ label, value, set, disabled }) => {
              const negative = !disabled && isNeg(value)
              return (
                <div key={label} className="text-center">
                  <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${
                    disabled ? 'text-slate-300' : negative ? 'text-red-500' : 'text-slate-500'
                  }`}>
                    {label}
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={value}
                    onChange={(e) => { set(e.target.value); setErro(null) }}
                    disabled={disabled}
                    className={`w-full text-center text-2xl font-bold px-1 py-3 rounded-xl border-[1.5px] focus:outline-none transition-colors ${
                      disabled
                        ? 'border-slate-100 bg-slate-100 text-slate-300 cursor-not-allowed'
                        : negative
                        ? 'border-red-400 bg-red-50 text-red-600 focus:border-red-500'
                        : 'border-slate-200 bg-white focus:border-blue-500'
                    }`}
                  />
                </div>
              )
            })}
          </div>

          {/* Total preview — additive mode only */}
          {isAdditive && entry && (
            <div className="rounded-xl bg-slate-900 p-4 mb-4 text-white">
              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide mb-3">
                Total After Addition
              </div>
              <div className="space-y-1.5 text-sm mb-3">
                <div className="flex justify-between">
                  <span className="text-slate-400">Registered</span>
                  <span className="text-slate-300 font-semibold">
                    {entry.pallets}p · {entry.cases}c · {entry.units}u
                  </span>
                </div>
                <div className="flex justify-between text-blue-400">
                  <span>+ Adding</span>
                  <span className="font-semibold">{addP}p · {addC}c · {addU}u</span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-700">
                <span className="text-sm font-bold text-slate-200">New Total</span>
                <span className="text-2xl font-bold">{previewAddCases}+{previewAddUnits}</span>
              </div>
            </div>
          )}

          {!isEdit && !isAdditive && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-600 mb-3">
              ℹ️ Zeroes are valid — confirms the item was counted and was empty.
            </div>
          )}
        </>
      )}

      {modo === 'peso' && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            📦 Tare: <strong className="text-slate-700">{item.box_tare_g.toLocaleString('en-GB')} g/box</strong>
            <span className="text-slate-300">·</span>
            ⚖️ Weight/unit: <strong className="text-slate-700">{item.weight_avg} g</strong>
          </div>

          {rodadas.map((r, i) => (
            <div key={r.id} className="border border-slate-200 rounded-xl p-3 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Round {i + 1}
                </span>
                {rodadas.length > 1 && (
                  <button
                    onClick={() => removeRodada(r.id)}
                    className="text-slate-300 hover:text-red-500 text-lg leading-none"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-1">
                    No. of Boxes
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={r.caixas}
                    onChange={(e) => updateRodada(r.id, 'caixas', e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-xl font-bold px-2 py-2.5 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-1">
                    Weight (g)
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.pesoFmt}
                    onChange={(e) => updateRodada(r.id, 'pesoFmt', e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-xl font-bold px-2 py-2.5 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addRodada}
            className="w-full border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            + New Weighing Round
          </button>

          {/* Visual cases — added to weighing result */}
          <div className="border-2 border-amber-300 rounded-xl overflow-hidden">
            <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800">
              📦 Full Cases (visually confirmed)
            </div>
            <div className="p-3 bg-white">
              <div className="flex items-center rounded-xl border border-amber-300 overflow-hidden">
                <button
                  onClick={() => setExtraCases((v) => Math.max(0, v - 1))}
                  className="w-12 h-12 bg-amber-50 text-amber-700 text-2xl font-bold flex items-center justify-center hover:bg-amber-100 transition-colors"
                >
                  −
                </button>
                <div className="flex-1 text-center text-2xl font-bold text-amber-800 h-12 flex items-center justify-center">
                  {extraCases}
                </div>
                <button
                  onClick={() => setExtraCases((v) => v + 1)}
                  className="w-12 h-12 bg-amber-50 text-amber-700 text-2xl font-bold flex items-center justify-center hover:bg-amber-100 transition-colors"
                >
                  +
                </button>
              </div>
              {extraCases > 0 && (
                <p className="text-xs text-amber-700 text-center mt-2">
                  {extraCases} case{extraCases > 1 ? 's' : ''} × {item.bpu} units = +{extraCases * item.bpu} additional units
                </p>
              )}
            </div>
          </div>

          <div className={`rounded-xl p-4 border ${
            hasWeightData && weightQty > 0 ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Total Tare</span>
                <span>{hasWeightData ? `${totalTara.toLocaleString('en-GB')} g` : '— g'}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Net Weight</span>
                <span>{hasWeightData ? `${Math.max(0, liquido).toLocaleString('en-GB')} g` : '— g'}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Weighing Result</span>
                <span>{hasWeightData ? `${weightQty} units` : '— units'}</span>
              </div>
              {extraCases > 0 && (
                <div className="flex justify-between text-amber-600 font-semibold">
                  <span>Visual Cases ({extraCases} × {item.bpu})</span>
                  <span>+{extraCases * item.bpu} units</span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200">
              <span className={`text-sm font-bold ${
                hasWeightData && weightQty > 0 ? 'text-green-700' : 'text-slate-400'
              }`}>
                Final Total
              </span>
              <span className={`text-2xl font-bold ${
                hasWeightData && weightQty > 0 ? 'text-green-700' : 'text-slate-300'
              }`}>
                {hasWeightData && weightQty > 0 ? `${previewCases}+${previewUnits}` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700 mb-3">
          {erro}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isPending || (modo === 'peso' && weightQty <= 0)}
        className="w-full bg-slate-900 text-white font-semibold py-4 rounded-xl text-base transition-opacity disabled:opacity-40"
      >
        {btnLabel}
      </button>
      <button
        onClick={onVoltar}
        className="w-full mt-2 text-slate-500 text-sm py-3 rounded-xl border border-slate-200 bg-white"
      >
        ← Back to Search
      </button>
    </div>
  )
}
