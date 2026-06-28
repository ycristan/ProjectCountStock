'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase-client'

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
  reconciliated_cases: number | null
  reconciliated_units: number | null
}

type Props = {
  sessionId: string
  teamId: string
  teamName: string
  teamStatus: string
  items: ReconcItem[]
  counterNames: { contador_1: string; contador_2: string; independente: string }
}

function formatVal(cases: number | null, units: number | null): string {
  if (cases === null) return '—'
  return `${cases}+${units}`
}

export function ReconciliacaoClient({
  sessionId,
  teamId,
  teamName,
  teamStatus,
  items,
  counterNames,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'discrepancias' | 'combinados'>('discrepancias')

  useEffect(() => {
    const supabase = createBrowserClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token
      if (!token) return
      supabase.realtime.setAuth(token)
      channel = supabase
        .channel('reconciliacao-admin')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reconciliation_items', filter: `team_id=eq.${teamId}` }, () => router.refresh())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` }, () => router.refresh())
        .subscribe()
    })
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [teamId, router])

  const combinados = items.filter((i) => i.status === 'combinado')
  const discrepancias = items.filter((i) => i.status === 'discrepancia')
  const resolvidos = items.filter((i) => i.status === 'resolvido')
  const isReconciliada = teamStatus === 'reconciliada'

  const tabItems = activeTab === 'discrepancias' ? [...discrepancias, ...resolvidos] : combinados

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Reconciliação — {teamName}</h2>
          <div className="text-sm text-slate-500 mt-0.5">Independente: {counterNames.independente}</div>
        </div>
        {isReconciliada && (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-green-100 text-green-700">
            ✓ Reconciliada
          </span>
        )}
      </div>

      <Link
        href={`/admin/sessao/${sessionId}/progresso`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Voltar ao progresso
      </Link>

      <div className="flex gap-3 mt-5 mb-5">
        <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-3xl font-bold text-green-600">{combinados.length}</div>
          <div className="text-xs text-slate-500 mt-1">Combinados</div>
        </div>
        <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4">
          <div
            className={`text-3xl font-bold ${
              discrepancias.length > 0 ? 'text-red-600' : 'text-slate-300'
            }`}
          >
            {discrepancias.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Discrepâncias restantes</div>
        </div>
        <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-3xl font-bold text-indigo-600">{resolvidos.length}</div>
          <div className="text-xs text-slate-500 mt-1">Reconciliados</div>
        </div>
      </div>

      {!isReconciliada && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-5">
          ℹ️ <strong>{counterNames.independente}</strong> está realizando a reconciliação dos
          itens com discrepância no dispositivo dele.
        </div>
      )}

      <div className="flex border-b border-slate-200 mb-4">
        <button
          onClick={() => setActiveTab('discrepancias')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            activeTab === 'discrepancias'
              ? 'text-slate-900 border-slate-900'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          Discrepâncias ({discrepancias.length} restantes)
        </button>
        <button
          onClick={() => setActiveTab('combinados')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            activeTab === 'combinados'
              ? 'text-slate-900 border-slate-900'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          Combinados ({combinados.length})
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-48">Item</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">
                {counterNames.contador_1} (C1)
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">
                {counterNames.contador_2} (C2)
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">
                {counterNames.independente} (Ind)
              </th>
              {activeTab === 'discrepancias' && (
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">
                  Reconciliado
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tabItems.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900 text-sm">{item.brand_code}</div>
                  <div className="text-xs text-slate-500">{item.brand_name}</div>
                  {item.bin_location && (
                    <div className="text-xs text-slate-400">{item.bin_location}</div>
                  )}
                </td>
                <td className="text-center px-4 py-3 font-medium text-slate-700">
                  {formatVal(item.contador_1_cases, item.contador_1_units)}
                </td>
                <td className="text-center px-4 py-3 font-medium text-slate-700">
                  {formatVal(item.contador_2_cases, item.contador_2_units)}
                </td>
                <td className="text-center px-4 py-3 font-medium text-slate-700">
                  {formatVal(item.independente_cases, item.independente_units)}
                </td>
                {activeTab === 'discrepancias' && (
                  <td className="text-center px-4 py-3">
                    {item.status === 'resolvido' ? (
                      <span className="font-bold text-green-700 text-sm">
                        {formatVal(item.reconciliated_cases, item.reconciliated_units)}
                      </span>
                    ) : (
                      <span className="text-amber-500 text-xs">Pendente</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {tabItems.length === 0 && (
              <tr>
                <td
                  colSpan={activeTab === 'discrepancias' ? 5 : 4}
                  className="px-4 py-8 text-center text-slate-400 text-sm"
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
    </div>
  )
}
