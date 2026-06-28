'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ReconcItemLista } from '@/actions/reconciliacao'
import { resolverItemReconciliacao, confirmarReconciliacao } from '@/actions/reconciliacao'

type Props = { items: ReconcItemLista[] }

export function ReconciliacaoCounterClient({ items }: Props) {
  const router = useRouter()
  const [inputs, setInputs] = useState<Record<string, { cases: string; units: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const pendingCount = items.filter((i) => i.status === 'discrepancia').length
  const canConfirm = pendingCount === 0 && items.length > 0

  function getInput(id: string) {
    return inputs[id] ?? { cases: '', units: '' }
  }

  async function handleSalvar(itemId: string) {
    const inp = getInput(itemId)
    const cases = parseInt(inp.cases, 10)
    const units = parseInt(inp.units, 10)
    if (isNaN(cases) || isNaN(units)) {
      setErro('Preencha os valores antes de salvar.')
      return
    }
    setSavingId(itemId)
    setErro(null)
    const result = await resolverItemReconciliacao(itemId, cases, units)
    setSavingId(null)
    if (result.error) {
      setErro(result.error)
    } else {
      router.refresh()
    }
  }

  function handleConfirmar() {
    setErro(null)
    startTransition(async () => {
      try {
        const result = await confirmarReconciliacao()
        if (result.error) {
          setErro(result.error)
        } else {
          router.push('/busca')
        }
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
                {resolved && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                    ✓ Reconciliado
                  </span>
                )}
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
                ) : (
                  <div>
                    <div className="text-xs text-slate-500 mb-2">Valor acordado após recontagem</div>
                    <div className="flex items-center gap-2">
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
                      <span className="text-slate-400 text-lg mt-4">+</span>
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
                      <button
                        onClick={() => handleSalvar(item.id)}
                        disabled={savingId === item.id}
                        className="mt-5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
                      >
                        {savingId === item.id ? '...' : 'Salvar'}
                      </button>
                    </div>
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
