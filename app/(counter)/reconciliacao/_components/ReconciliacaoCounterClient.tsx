'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import type { ReconcItemLista } from '@/actions/reconciliacao'
import { resolverItemReconciliacao, confirmarReconciliacao } from '@/actions/reconciliacao'

type Props = { items: ReconcItemLista[] }

function formatGrams(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const num = parseInt(digits || '0', 10)
  return num === 0 ? '' : num.toLocaleString('pt-BR')
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
  const decimal = raw - Math.floor(raw)
  const units_total = raw > 0 ? (decimal >= 0.7 ? Math.ceil(raw) : Math.floor(raw)) : 0
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

export function ReconciliacaoCounterClient({ items }: Props) {
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
      const teamId = data.session?.user?.user_metadata?.team_id as string | undefined
      if (!token || !teamId) return
      supabase.realtime.setAuth(token)
      channel = supabase
        .channel('reconciliacao-counter')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reconciliation_items', filter: `team_id=eq.${teamId}` }, () => router.refresh())
        .subscribe()
    })
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [router])

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
    const pallets = parseInt(inp.pallets || '0', 10) || 0
    const cases = parseInt(inp.cases || '0', 10)
    const units = parseInt(inp.units || '0', 10)
    if (isNaN(cases) || isNaN(units)) {
      setErro('Preencha os valores antes de salvar.')
      return
    }
    const reconciliated_cases = pallets * item.pallet_size + cases
    setSavingId(item.id)
    setErro(null)
    const result = await resolverItemReconciliacao(item.id, reconciliated_cases, units)
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
      setErro('Peso insuficiente — verifique os valores.')
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
        setErro('Erro de conexão — recarregue a página e tente novamente.')
      }
    })
  }

  return (
    <div>
      <Link
        href="/busca"
        className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        ← Voltar à busca
      </Link>

      <h2 className="text-xl font-semibold text-slate-900 mb-1">Reconciliação</h2>
      <p className="text-sm text-slate-500 mb-5">
        {pendingCount > 0
          ? `${pendingCount} ${pendingCount === 1 ? 'item pendente' : 'itens pendentes'} — faça a recontagem física com a equipe e registre o valor acordado.`
          : 'Todos os itens foram reconciliados. Confirme para finalizar.'}
      </p>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700 mb-4">
          {erro}
        </div>
      )}

      <div className="space-y-3 mb-6">
        {items.map((item) => {
          const resolved = item.status === 'resolvido'
          const inp = getInput(item.id)
          const wi = getWeightInput(item.id)
          const wCalc = item.is_weight_count
            ? calcWeight(wi.caixas, wi.pesoFmt, item.weight_avg, item.box_tare_g, item.bpu)
            : null

          return (
            <div
              key={item.id}
              className={`bg-white border rounded-xl overflow-hidden ${
                resolved ? 'border-green-200' : 'border-amber-200'
              }`}
            >
              <div
                className={`px-4 py-3 flex items-start justify-between ${
                  resolved ? 'bg-green-50' : 'bg-amber-50'
                }`}
              >
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{item.brand_code}</div>
                  <div className="text-xs text-slate-500">{item.brand_name}</div>
                  {item.bin_location && (
                    <div className="text-xs text-slate-400">{item.bin_location}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {item.is_weight_count && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      ⚖️ Peso
                    </span>
                  )}
                  {resolved && (
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                      ✓ Reconciliado
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                {[
                  { label: 'C1', cases: item.contador_1_cases, units: item.contador_1_units },
                  { label: 'C2', cases: item.contador_2_cases, units: item.contador_2_units },
                  { label: 'Ind', cases: item.independente_cases, units: item.independente_units },
                ].map(({ label, cases, units }) => (
                  <div key={label} className="px-3 py-2 text-center">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
                      {label}
                    </div>
                    <div className="text-sm font-semibold text-slate-700">
                      {cases === null ? '—' : `${cases}+${units}`}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3">
                {resolved ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Contagem reconciliada</span>
                    <span className="font-bold text-green-700 text-sm">
                      {item.reconciliated_cases} cx + {item.reconciliated_units} un
                    </span>
                  </div>
                ) : item.is_weight_count ? (
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-3">
                      📦 Tara: <strong className="text-slate-700">{item.box_tare_g.toLocaleString('pt-BR')} g/cx</strong>
                      <span className="text-slate-300">·</span>
                      ⚖️ <strong className="text-slate-700">{item.weight_avg} g/un</strong>
                    </div>
                    <div className="text-xs text-slate-500 mb-2">Valor acordado após recontagem</div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <div className="text-[10px] text-slate-400 mb-1">Nº de caixas</div>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={wi.caixas}
                          onChange={(e) =>
                            setWeightInputs((prev) => ({
                              ...prev,
                              [item.id]: { ...getWeightInput(item.id), caixas: e.target.value },
                            }))
                          }
                          placeholder="0"
                          className="w-full text-center text-lg font-bold px-2 py-2 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] text-slate-400 mb-1">Peso (g)</div>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={wi.pesoFmt}
                          onChange={(e) =>
                            setWeightInputs((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...getWeightInput(item.id),
                                pesoFmt: formatGrams(e.target.value),
                              },
                            }))
                          }
                          placeholder="0"
                          className="w-full text-center text-lg font-bold px-2 py-2 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <button
                        onClick={() =>
                          handleSalvarPeso(item.id, item.weight_avg, item.box_tare_g, item.bpu)
                        }
                        disabled={savingId === item.id || !wCalc?.valid}
                        className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
                      >
                        {savingId === item.id ? '...' : 'Salvar'}
                      </button>
                    </div>
                    {wCalc && wCalc.valid && (
                      <div className="mt-2 text-xs text-green-700 font-medium">
                        → {wCalc.units_total} un ({wCalc.final_cases} cx + {wCalc.final_units} un)
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="text-xs text-slate-500 mb-2">Valor acordado após recontagem</div>
                    <div className="flex items-end gap-1 mb-2">
                      <div className="flex-1">
                        <div className="text-[10px] text-slate-400 mb-1">Pallets (pt)</div>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={inp.pallets}
                          onChange={(e) =>
                            setInputs((prev) => ({
                              ...prev,
                              [item.id]: { ...getInput(item.id), pallets: e.target.value },
                            }))
                          }
                          placeholder="0"
                          className="w-full text-center text-lg font-bold px-2 py-2 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <span className="text-slate-400 text-sm pb-2.5">×</span>
                      <div className="flex-1">
                        <div className="text-[10px] text-slate-400 mb-1">Cases (cx)</div>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={inp.cases}
                          onChange={(e) =>
                            setInputs((prev) => ({
                              ...prev,
                              [item.id]: { ...getInput(item.id), cases: e.target.value },
                            }))
                          }
                          placeholder="0"
                          className="w-full text-center text-lg font-bold px-2 py-2 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <span className="text-slate-400 text-sm pb-2.5">+</span>
                      <div className="flex-1">
                        <div className="text-[10px] text-slate-400 mb-1">Units (un)</div>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={inp.units}
                          onChange={(e) =>
                            setInputs((prev) => ({
                              ...prev,
                              [item.id]: { ...getInput(item.id), units: e.target.value },
                            }))
                          }
                          placeholder="0"
                          className="w-full text-center text-lg font-bold px-2 py-2 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleSalvar(item)}
                      disabled={savingId === item.id}
                      className="w-full px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
                    >
                      {savingId === item.id ? '...' : 'Salvar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {items.length === 0 && (
        <div className="text-center text-slate-400 py-12 text-sm">Nenhum item para reconciliar.</div>
      )}

      <button
        onClick={handleConfirmar}
        disabled={!canConfirm || isPending}
        className="w-full py-4 rounded-xl text-base font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? 'Confirmando...' : 'Finalizar e Confirmar Reconciliação'}
      </button>
    </div>
  )
}
