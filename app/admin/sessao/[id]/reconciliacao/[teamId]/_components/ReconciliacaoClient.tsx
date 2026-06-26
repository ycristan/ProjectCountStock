'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { resolverItem, confirmarReconciliacao } from '@/actions/reconciliacao'

type ReconcItem = {
  id: string
  brand_code: string
  brand_name: string
  bin_location: string | null
  status: 'combinado' | 'discrepancia' | 'resolvido'
  contador_1_cases: number | null
  contador_1_units: number | null
  contador_2_cases: number | null
  contador_2_units: number | null
  independente_cases: number | null
  independente_units: number | null
}

type Props = {
  sessionId: string
  teamId: string
  teamName: string
  teamStatus: string
  items: ReconcItem[]
  counterNames: { contador_1: string; contador_2: string; independente: string }
}

function cellColor(
  myCases: number | null,
  myUnits: number | null,
  others: [number | null, number | null][],
): string {
  if (myCases === null) return 'text-center font-medium text-amber-500'
  const matchesAll = others.every(
    ([c, u]) => c === null || (c === myCases && u === myUnits),
  )
  return matchesAll
    ? 'text-center font-medium text-green-600'
    : 'text-center font-medium text-red-600'
}

function formatVal(cases: number | null, units: number | null): string {
  if (cases === null) return '— não contado'
  return `${cases} + ${units}`
}

export function ReconciliacaoClient({
  sessionId,
  teamId,
  teamName,
  items,
  counterNames,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'discrepancias' | 'combinados'>('discrepancias')
  const [inputs, setInputs] = useState<Record<string, { cases: string; units: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [confirmingTeam, setConfirmingTeam] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const combinados = items.filter((i) => i.status === 'combinado')
  const discrepancias = items.filter((i) => i.status === 'discrepancia')
  const resolvidos = items.filter((i) => i.status === 'resolvido')
  const canConfirmar = discrepancias.length === 0

  function getInput(id: string) {
    return inputs[id] ?? { cases: '', units: '' }
  }

  function setInput(id: string, field: 'cases' | 'units', value: string) {
    setInputs((prev) => ({ ...prev, [id]: { ...getInput(id), [field]: value } }))
  }

  async function handleSalvar(item: ReconcItem) {
    const inp = getInput(item.id)
    const finalCases = parseInt(inp.cases, 10)
    const finalUnits = parseInt(inp.units, 10)
    if (isNaN(finalCases) || isNaN(finalUnits)) {
      setError('Preencha os valores antes de salvar.')
      return
    }
    setSavingId(item.id)
    setError(null)
    const result = await resolverItem(item.id, finalCases, finalUnits)
    if (result.error) {
      setError(result.error)
    } else {
      router.refresh()
    }
    setSavingId(null)
  }

  async function handleConfirmar() {
    setError(null)
    setConfirmingTeam(true)
    const result = await confirmarReconciliacao(teamId)
    if (result.error) {
      setError(result.error)
    } else {
      router.refresh()
    }
    setConfirmingTeam(false)
  }

  const tabItems =
    activeTab === 'discrepancias' ? [...discrepancias, ...resolvidos] : combinados

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Reconciliação — {teamName}</h2>
          <div className="text-sm text-gray-500 mt-0.5">
            {counterNames.independente} é o Independente
          </div>
        </div>
        <button
          onClick={handleConfirmar}
          disabled={!canConfirmar || confirmingTeam}
          className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity ${
            canConfirmar && !confirmingTeam
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-green-600 opacity-40 cursor-not-allowed'
          }`}
        >
          {confirmingTeam ? 'Confirmando...' : 'Confirmar Reconciliação'}
        </button>
      </div>

      <Link
        href={`/admin/sessao/${sessionId}/progresso`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Voltar ao progresso
      </Link>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3 mt-5 mb-5">
        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-3xl font-bold text-green-600">{combinados.length}</div>
          <div className="text-xs text-gray-500 mt-1">Combinados</div>
        </div>
        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-3xl font-bold text-red-600">{discrepancias.length}</div>
          <div className="text-xs text-gray-500 mt-1">Discrepâncias restantes</div>
        </div>
        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-3xl font-bold text-indigo-600">{resolvidos.length}</div>
          <div className="text-xs text-gray-500 mt-1">Resolvidos</div>
        </div>
      </div>

      {discrepancias.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-5">
          ⚠️ <strong>{counterNames.independente} (Independente)</strong> vai ao local e registra o
          valor acordado após recontagem física de cada item com discrepância.
        </div>
      )}

      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab('discrepancias')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            activeTab === 'discrepancias'
              ? 'text-indigo-600 border-indigo-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          Discrepâncias ({discrepancias.length} restantes)
        </button>
        <button
          onClick={() => setActiveTab('combinados')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            activeTab === 'combinados'
              ? 'text-indigo-600 border-indigo-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          Combinados ({combinados.length})
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-48">Item</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">
                {counterNames.contador_1} (C1)
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">
                {counterNames.contador_2} (C2)
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">
                {counterNames.independente} (Ind)
              </th>
              {activeTab === 'discrepancias' && (
                <>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">
                    Valor acordado
                  </th>
                  <th className="px-4 py-3 w-20" />
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tabItems.map((item) => {
              const isResolved = item.status === 'resolvido'
              const c1: [number | null, number | null] = [item.contador_1_cases, item.contador_1_units]
              const c2: [number | null, number | null] = [item.contador_2_cases, item.contador_2_units]
              const ind: [number | null, number | null] = [
                item.independente_cases,
                item.independente_units,
              ]

              return (
                <tr key={item.id} className={isResolved ? 'opacity-50' : ''}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 text-sm">{item.brand_code}</div>
                    <div className="text-xs text-gray-500">{item.brand_name}</div>
                    {item.bin_location && (
                      <div className="text-xs text-gray-400">{item.bin_location}</div>
                    )}
                  </td>
                  <td className={cellColor(c1[0], c1[1], [c2, ind])}>
                    {c1[0] === null ? (
                      <span className="text-amber-500">— não contado</span>
                    ) : (
                      formatVal(c1[0], c1[1])
                    )}
                  </td>
                  <td className={cellColor(c2[0], c2[1], [c1, ind])}>
                    {c2[0] === null ? (
                      <span className="text-amber-500">— não contado</span>
                    ) : (
                      formatVal(c2[0], c2[1])
                    )}
                  </td>
                  <td className={cellColor(ind[0], ind[1], [c1, c2])}>
                    {ind[0] === null ? (
                      <span className="text-amber-500">— não contado</span>
                    ) : (
                      formatVal(ind[0], ind[1])
                    )}
                  </td>
                  {activeTab === 'discrepancias' && (
                    <>
                      <td className="px-4 py-3 text-center">
                        {isResolved ? (
                          <span className="font-semibold text-blue-700 text-sm">
                            {formatVal(item.independente_cases, item.independente_units)}
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={getInput(item.id).cases}
                              onChange={(e) => setInput(item.id, 'cases', e.target.value)}
                              className="w-14 text-center border border-gray-300 rounded-lg px-2 py-1 text-sm font-semibold bg-gray-50"
                              placeholder="0"
                            />
                            <span className="text-gray-400 text-sm">+</span>
                            <input
                              type="number"
                              min={0}
                              value={getInput(item.id).units}
                              onChange={(e) => setInput(item.id, 'units', e.target.value)}
                              className="w-14 text-center border border-gray-300 rounded-lg px-2 py-1 text-sm font-semibold bg-gray-50"
                              placeholder="0"
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isResolved ? (
                          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                            ✓ Salvo
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSalvar(item)}
                            disabled={savingId === item.id}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60"
                          >
                            {savingId === item.id ? '...' : 'Salvar'}
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {tabItems.length === 0 && (
              <tr>
                <td
                  colSpan={activeTab === 'discrepancias' ? 6 : 4}
                  className="px-4 py-8 text-center text-gray-400 text-sm"
                >
                  {activeTab === 'discrepancias'
                    ? 'Nenhuma discrepância pendente.'
                    : 'Nenhum item combinado.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeTab === 'discrepancias' && discrepancias.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-500">
            {discrepancias.length} discrepância{discrepancias.length !== 1 ? 's' : ''} restante
            {discrepancias.length !== 1 ? 's' : ''} — resolva todas para confirmar
          </div>
          <button
            onClick={handleConfirmar}
            disabled={!canConfirmar || confirmingTeam}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity ${
              canConfirmar && !confirmingTeam
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-green-600 opacity-40 cursor-not-allowed'
            }`}
          >
            Confirmar Reconciliação
          </button>
        </div>
      )}
    </div>
  )
}
