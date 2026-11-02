'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { Button, Label, Notice, PageTop, Tag, cardClass } from '@/components/ui'
import { weightUnits } from '@/lib/weight-count'
import type { ReconcItemLista } from '@/actions/reconciliacao'
import { resolverItemReconciliacao, confirmarReconciliacao } from '@/actions/reconciliacao'

type Props = { items: ReconcItemLista[]; teamId: string; readOnly?: boolean }

function formatGrams(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const num = parseInt(digits || '0', 10)
  return num === 0 ? '' : num.toLocaleString('en-GB')
}

function calcWeight(
  caixas: string,
  pesoFmt: string,
  weight_avg: number,
  box_tare_g: number,
  bpu: number,
) {
  const numCaixas = parseInt(caixas || '0', 10)
  const pesoGrams = parseInt(pesoFmt.replace(/\D/g, '') || '0', 10)
  const tara = numCaixas * box_tare_g
  const liquido = pesoGrams - tara
  const raw = liquido > 0 && weight_avg > 0 ? liquido / weight_avg : 0
  const units_total = weightUnits(raw)
  const safeBpu = bpu > 0 ? bpu : 1
  return {
    tara,
    liquido: Math.max(0, liquido),
    units_total,
    final_cases: Math.floor(units_total / safeBpu),
    final_units: units_total % safeBpu,
    valid: units_total > 0,
  }
}

export function ReconciliacaoCounterClient({ items, teamId, readOnly = false }: Props) {
  const router = useRouter()
  const [inputs, setInputs] = useState<Record<string, { pallets: string; cases: string; units: string }>>({})
  const [weightInputs, setWeightInputs] = useState<Record<string, { caixas: string; pesoFmt: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token
      if (!token) return
      supabase.realtime.setAuth(token)
      channel = supabase
        .channel('reconciliacao-counter')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reconciliation_items', filter: `team_id=eq.${teamId}` }, () => router.refresh())
        .subscribe()
    })
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [router, teamId])

  const pendingCount = items.filter((i) => i.status === 'discrepancia').length
  const canConfirm = pendingCount === 0 && items.length > 0

  function getInput(id: string) {
    return inputs[id] ?? { pallets: '', cases: '', units: '' }
  }

  function getWeightInput(id: string) {
    return weightInputs[id] ?? { caixas: '', pesoFmt: '' }
  }

  async function handleSalvar(item: ReconcItemLista) {
    const inp = getInput(item.id)
    const noBpu = item.bpu === 1
    const pallets = parseInt(inp.pallets || '0', 10) || 0
    const cases = parseInt(inp.cases || '0', 10)
    const units = parseInt(inp.units || '0', 10)
    if (isNaN(cases) || isNaN(units)) {
      setErro('Please fill in the values before saving.')
      return
    }
    // BPU=1: everything is stored as cases (units input becomes reconciliated_cases)
    const reconciliated_cases = noBpu ? units : (pallets * item.pallet_size + cases)
    const reconciliated_units = noBpu ? 0 : units
    setSavingId(item.id)
    setErro(null)
    const result = await resolverItemReconciliacao(item.id, reconciliated_cases, reconciliated_units)
    setSavingId(null)
    if (result.error) setErro(result.error)
    else router.refresh()
  }

  async function handleSalvarPeso(
    itemId: string,
    weight_avg: number,
    box_tare_g: number,
    bpu: number,
  ) {
    const wi = getWeightInput(itemId)
    const calc = calcWeight(wi.caixas, wi.pesoFmt, weight_avg, box_tare_g, bpu)
    if (!calc.valid) {
      setErro('Insufficient weight — please check the values.')
      return
    }
    setSavingId(itemId)
    setErro(null)
    const result = await resolverItemReconciliacao(itemId, calc.final_cases, calc.final_units)
    setSavingId(null)
    if (result.error) setErro(result.error)
    else router.refresh()
  }

  function handleConfirmar() {
    setErro(null)
    startTransition(async () => {
      try {
        const result = await confirmarReconciliacao()
        if (result.error) setErro(result.error)
        else router.push('/busca')
      } catch {
        setErro('Connection error — please reload the page and try again.')
      }
    })
  }

  const bigInput = 'w-full min-h-14 rounded-md border-2 border-ink bg-surface px-2 text-center font-display text-2xl font-bold outline-none focus-visible:outline-3 focus-visible:outline-info placeholder:text-ink-3 disabled:cursor-not-allowed disabled:border-ground-2 disabled:bg-ground-2 disabled:text-ink-3'
  const field = (label: string, input: React.ReactNode) => (
    <label className="flex flex-1 flex-col items-center gap-1"><span className="text-[13px] font-semibold">{label}</span>{input}</label>
  )

  return (
    <div>
      <PageTop back={{ href: '/busca', label: 'Search' }} title="Reconciliation" />
      <p className="m-0 mb-4 text-[15px] text-ink-2">
        {readOnly
          ? `${items.length} ${items.length === 1 ? 'item is' : 'items are'} being reconciled by the independent counter.`
          : pendingCount > 0
          ? `${pendingCount} ${pendingCount === 1 ? 'item pending' : 'items pending'} — carry out a physical recount with the team and record the agreed value.`
          : 'All items have been reconciled. Confirm to finalise.'}
      </p>

      {erro && <div className="mb-4"><Notice>{erro}</Notice></div>}

      <div className="mb-6 flex flex-col gap-3">
        {items.map((item) => {
          const resolved = item.status === 'resolvido'
          const noBpu = item.bpu === 1
          const inp = getInput(item.id)
          const wi = getWeightInput(item.id)
          const wCalc = item.is_weight_count
            ? calcWeight(wi.caixas, wi.pesoFmt, item.weight_avg, item.box_tare_g, item.bpu)
            : null

          return (
            <div key={item.id} className={cardClass + ' overflow-hidden ' + (resolved ? '' : 'border-2 border-ink')}>
              <div className={'flex items-start justify-between gap-2 px-3.5 py-3 ' + (resolved ? 'bg-ok/10' : 'bg-diff/10')}>
                <div className="flex min-w-0 flex-col">
                  <span className="font-mono text-xs font-semibold text-ink-2">{item.brand_code}</span>
                  <strong>{item.brand_name}</strong>
                  {item.bin_location && <span className="mt-1 w-fit rounded-sm border-[1.5px] border-ink bg-line px-1.5 font-mono text-[13px] font-semibold">{item.bin_location}</span>}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {item.is_weight_count && <Tag tone="info">Weight</Tag>}
                  {resolved && <Tag tone="ok">✓ Reconciled</Tag>}
                </div>
              </div>

              {/* C1 vs C2 comparison */}
              <div className="grid grid-cols-2 divide-x divide-ground-2 border-b border-ground-2">
                {[
                  { label: 'C1', cases: item.contador_1_cases, units: item.contador_1_units },
                  { label: 'C2', cases: item.contador_2_cases, units: item.contador_2_units },
                ].map(({ label, cases, units }) => (
                  <div key={label} className="flex flex-col items-center px-3 py-2">
                    <Label>{label}</Label>
                    <span className="font-display text-2xl font-bold">{cases === null ? '—' : `${cases}+${units}`}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 px-3.5 py-3">
                {resolved ? (
                  <div className="flex items-center justify-between gap-2">
                    <Label>Reconciled Count</Label>
                    <span className="font-display text-xl font-bold text-ok">{item.reconciliated_cases} cases + {item.reconciliated_units} units</span>
                  </div>
                ) : readOnly ? (
                  <p className="m-0 text-[15px] text-ink-2">Pending — the independent counter is reviewing this item.</p>
                ) : item.is_weight_count ? (
                  <>
                    <p className="m-0 rounded-md border border-line bg-ground px-3 py-2 text-[13px] text-ink-2">
                      Tare: <strong className="text-ink">{item.box_tare_g.toLocaleString('en-GB')} g/box</strong> · <strong className="text-ink">{item.weight_avg} g/unit</strong>
                    </p>
                    <Label>Agreed value after recount</Label>
                    <div className="flex items-end gap-2">
                      {field('No. of Boxes', <input type="number" inputMode="numeric" min="0" value={wi.caixas} placeholder="0" className={bigInput}
                        onChange={(e) => setWeightInputs((prev) => ({ ...prev, [item.id]: { ...getWeightInput(item.id), caixas: e.target.value } }))} />)}
                      {field('Weight (g)', <input type="text" inputMode="numeric" value={wi.pesoFmt} placeholder="0" className={bigInput}
                        onChange={(e) => setWeightInputs((prev) => ({ ...prev, [item.id]: { ...getWeightInput(item.id), pesoFmt: formatGrams(e.target.value) } }))} />)}
                    </div>
                    {wCalc && wCalc.valid && (
                      <p className="m-0 text-[15px] font-semibold text-ok">→ {wCalc.units_total} units ({wCalc.final_cases} cases + {wCalc.final_units} units)</p>
                    )}
                    <Button variant="dark" full onClick={() => handleSalvarPeso(item.id, item.weight_avg, item.box_tare_g, item.bpu)} disabled={savingId === item.id || !wCalc?.valid}>
                      {savingId === item.id ? '...' : 'Save'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Label>Agreed value after recount</Label>
                    <div className="flex items-end gap-2">
                      {field('Pallets', <input type="number" inputMode="numeric" min="0" value={inp.pallets} placeholder="0" disabled={noBpu} className={bigInput}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [item.id]: { ...getInput(item.id), pallets: e.target.value } }))} />)}
                      <span className="pb-4 text-ink-2">×</span>
                      {field('Cases', <input type="number" inputMode="numeric" min="0" value={inp.cases} placeholder="0" disabled={noBpu} className={bigInput}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [item.id]: { ...getInput(item.id), cases: e.target.value } }))} />)}
                      <span className="pb-4 text-ink-2">+</span>
                      {field('Units', <input type="number" inputMode="numeric" min="0" value={inp.units} placeholder="0" className={bigInput}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [item.id]: { ...getInput(item.id), units: e.target.value } }))} />)}
                    </div>
                    <Button variant="dark" full onClick={() => handleSalvar(item)} disabled={savingId === item.id}>
                      {savingId === item.id ? '...' : 'Save'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {items.length === 0 && <p className="m-0 py-12 text-center text-[15px] text-ink-2">No items to reconcile.</p>}

      {!readOnly && (
        <Button variant="primary" size="lg" full onClick={handleConfirmar} disabled={!canConfirm || isPending}>
          {isPending ? 'Confirming...' : 'Finalise and Confirm Reconciliation'}
        </Button>
      )}
    </div>
  )
}
