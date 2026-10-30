'use client'

import { useState, useTransition } from 'react'
import type { ItemBusca, LancarContagemPayload, LancarContagemResult } from '@/actions/contagem'
import { lancarContagem } from '@/actions/contagem'
import { weightUnits } from '@/lib/weight-count'
import { Button, Label, Tag } from '@/components/ui'

type SucessoResult = {
  final_cases: number
  final_units: number
  brand_name: string
  entry: { pallets: number; cases: number; units: number }
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
  // ponytail: input em branco (não "0") evita erro de digitação (apagar "0" e teclar 1 → "10").
  // Submit já coage "" → 0 via `parseInt(x) || 0`. Só edição mostra o valor salvo; nova/additive = branco.
  const [pallets, setPallets] = useState(noPallets || noBpu ? '0' : !isAdditive && entry ? String(entry.pallets) : '')
  const [cases, setCases] = useState(noBpu ? '0' : !isAdditive && entry ? String(entry.cases) : '')
  // ponytail: edit + bpu=1 → collapse existing cases+units into units (bpu=1 normalises all to final_cases)
  const [units, setUnits] = useState(
    noBpu ? (!isAdditive && entry ? String((entry.cases ?? 0) + (entry.units ?? 0)) : '')
    : !isAdditive && entry ? String(entry.units) : ''
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
  const weightQty = weightUnits(raw)
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
          weighing: modo === 'peso' ? {
            rounds: rodadas.map((r) => ({ boxes: parseInt(r.caixas || '0', 10), grams: parseGrams(r.pesoFmt) })),
            visualCases: extraCases,
          } : undefined,
        })
        if (result.error) {
          setErro(result.error)
        } else {
          onSucesso({
            final_cases: result.final_cases!,
            final_units: result.final_units!,
            brand_name: result.brand_name!,
            // ponytail: reports the exact raw total just saved, so the next "+ Add to
            // Count" on this item builds on it instead of the page-load snapshot
            entry: { pallets: p, cases: c, units: u },
          })
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

  const fieldBox = 'flex flex-col gap-1.5 rounded-md border border-line bg-surface p-3'
  const bigInput = 'w-full rounded-lg border-2 px-1 py-2.5 text-center font-display text-[28px] font-bold outline-none focus:outline-3 focus:outline-info'

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onVoltar}
        className="inline-flex min-h-11 w-fit items-center gap-1 text-[15px] font-medium text-ink">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 5l-7 7 7 7" /></svg>
        Back to search
      </button>

      <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[13px] font-semibold text-ink-2">
            {item.brand_code}{item.bins.length > 0 ? ' · BIN ' + item.bins.join(', ') : ''}
          </span>
          {isAdditive && <Tag tone="info">Adding</Tag>}
          {isEdit && <Tag tone="safety">Editing</Tag>}
        </div>
        <span className="text-lg font-semibold">{item.brand_name}</span>
        <span className="text-[13px] text-ink-2">
          BPU {item.bpu} · Pallet {item.pallet_size}{item.weight_avg > 0 && ` · ${item.weight_avg} g per unit`}
        </span>
      </div>

      {/* Readonly card of existing count — additive mode only */}
      {isAdditive && entry && (
        <div className="flex flex-col gap-2">
          <Label>Registered Count</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Pallets', value: entry.pallets },
              { label: 'Cases', value: entry.cases },
              { label: 'Units', value: entry.units },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md border border-line bg-[#ECE9E1] py-2 text-center">
                <div className="font-display text-[26px] font-bold">{value}</div>
                <div className="text-xs font-semibold text-ink-2">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weight mode toggle — hidden in additive mode */}
      {!isAdditive && item.weight_avg > 0 && (
        <div role="group" aria-label="Count method" className="grid grid-cols-2 gap-1 rounded-md bg-ground-2 p-1">
          {([['normal', 'Count by Quantity'], ['peso', 'Count by Weight']] as const).map(([m, label]) =>
            <button key={m} type="button" aria-pressed={modo === m} onClick={() => switchModo(m)}
              className={'min-h-11 rounded-lg text-[15px] font-semibold ' + (modo === m ? 'bg-ink text-white' : 'bg-transparent text-ink-2')}>
              {label}
            </button>)}
        </div>
      )}

      {modo === 'normal' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: isAdditive ? '+ Pallets' : 'Pallets', value: pallets, set: setPallets, disabled: noPallets || noBpu },
              { label: isAdditive ? '+ Cases' : 'Cases', value: cases, set: setCases, disabled: noBpu },
              { label: isAdditive ? '+ Units' : 'Units', value: units, set: setUnits, disabled: false },
            ].map(({ label, value, set, disabled }) => {
              const negative = !disabled && isNeg(value)
              return (
                <label key={label} className="flex flex-col items-center gap-1">
                  <span className={'text-[13px] font-semibold ' + (disabled ? 'text-ink-3' : negative ? 'text-alert' : 'text-ink')}>{label}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={value}
                    onChange={(e) => { set(e.target.value); setErro(null) }}
                    placeholder="0"
                    disabled={disabled}
                    className={bigInput + ' ' + (disabled
                      ? 'cursor-not-allowed border-ground-2 bg-ground-2 text-ink-3'
                      : negative ? 'border-alert bg-[#FDECEA] text-alert' : 'border-ink bg-surface')}
                  />
                </label>
              )
            })}
          </div>

          {/* Total preview — additive mode only */}
          {isAdditive && entry && (
            <div className="rounded-xl bg-ink p-4 text-ground">
              <div className="flex justify-between text-sm"><span className="text-[#C9C6BE]">Registered</span>
                <span className="font-semibold">{entry.pallets}p · {entry.cases}c · {entry.units}u</span></div>
              <div className="mt-1 flex justify-between text-sm"><span className="text-[#C9C6BE]">+ Adding</span>
                <span className="font-semibold">{addP}p · {addC}c · {addU}u</span></div>
              <div className="mt-3 flex items-center justify-between border-t border-ink-2 pt-3">
                <Label className="text-[#C9C6BE]">New total</Label>
                <span className="font-display text-[34px] font-bold text-safety">{previewAddCases}+{previewAddUnits}</span>
              </div>
            </div>
          )}

          {!isEdit && !isAdditive && (
            <p className="m-0 text-[13px] text-ink-2">Zero is valid: it confirms the product was checked and the place was empty.</p>
          )}
        </>
      )}

      {modo === 'peso' && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[13px] text-ink-2">
            Box tare <strong className="text-ink">{item.box_tare_g.toLocaleString('en-GB')} g</strong> · Weight per unit <strong className="text-ink">{item.weight_avg} g</strong>
          </p>

          {rodadas.map((r, i) => (
            <div key={r.id} className={fieldBox}>
              <div className="flex items-center justify-between">
                <Label>Weighing {i + 1}</Label>
                {rodadas.length > 1 && (
                  <button type="button" onClick={() => removeRodada(r.id)} aria-label={'Remove weighing ' + (i + 1)}
                    className="flex size-11 items-center justify-center text-ink-2">
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-semibold">Boxes on scale</span>
                  <input type="number" inputMode="numeric" min="0" value={r.caixas}
                    onChange={(e) => updateRodada(r.id, 'caixas', e.target.value)} placeholder="0"
                    className={bigInput + ' border-ink bg-surface'} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-semibold">Gross weight (g)</span>
                  <input type="text" inputMode="numeric" value={r.pesoFmt}
                    onChange={(e) => updateRodada(r.id, 'pesoFmt', e.target.value)} placeholder="0"
                    className={bigInput + ' border-ink bg-surface'} />
                </label>
              </div>
            </div>
          ))}

          <Button type="button" variant="quiet" size="md" full onClick={addRodada} className="border-dashed">+ Add another weighing</Button>

          {/* Visual cases — added to weighing result */}
          {!noBpu && <div className={fieldBox}>
            <span className="text-[15px] font-semibold">Full Cases (visually confirmed)</span>
            <div className="flex items-center justify-between gap-2">
              <button type="button" aria-label="One case less" onClick={() => setExtraCases((v) => Math.max(0, v - 1))}
                className="flex size-12 items-center justify-center rounded-lg border-2 border-ink bg-surface font-display text-2xl font-bold">−</button>
              <span className="font-display text-3xl font-bold">{extraCases}</span>
              <button type="button" aria-label="One case more" onClick={() => setExtraCases((v) => v + 1)}
                className="flex size-12 items-center justify-center rounded-lg border-2 border-ink bg-surface font-display text-2xl font-bold">+</button>
            </div>
            {extraCases > 0 && (
              <span className="text-center text-[13px] text-ink-2">
                {extraCases} case{extraCases > 1 ? 's' : ''} × {item.bpu} units = +{extraCases * item.bpu} units
              </span>
            )}
          </div>}

          <div className="rounded-xl bg-ink p-4 text-ground">
            <div className="flex flex-col gap-1 text-sm text-[#C9C6BE]">
              <div className="flex justify-between"><span>Total tare</span><span>{hasWeightData ? `${totalTara.toLocaleString('en-GB')} g` : '—'}</span></div>
              <div className="flex justify-between"><span>Net weight</span><span>{hasWeightData ? `${Math.max(0, liquido).toLocaleString('en-GB')} g` : '—'}</span></div>
              <div className="flex justify-between"><span>From the scale</span><span>{hasWeightData ? `${weightQty} units` : '—'}</span></div>
              {extraCases > 0 && <div className="flex justify-between"><span>Full cases ({extraCases} × {item.bpu})</span><span>+{extraCases * item.bpu} units</span></div>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-ink-2 pt-3">
              <Label className="text-[#C9C6BE]">Result</Label>
              <span className="font-display text-[34px] font-bold text-safety">
                {hasWeightData && weightQty > 0 ? `${previewCases}+${previewUnits}` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-sm font-medium text-white">{erro}</p>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-ground px-4 py-3">
        <Button variant="primary" size="lg" full onClick={handleSubmit}
          disabled={isPending || (modo === 'peso' && weightQty <= 0)}>
          {btnLabel}
        </Button>
      </div>
    </div>
  )
}
