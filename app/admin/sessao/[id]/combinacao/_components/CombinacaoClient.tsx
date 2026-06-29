'use client'

import { Fragment, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { combinarSessao } from '@/actions/combinacao'

type ReconcItem = {
  team_id: string
  brand_code: string
  status: string
  contador_1_cases: number | null
  contador_1_units: number | null
  contador_2_cases: number | null
  contador_2_units: number | null
  independente_cases: number | null
  independente_units: number | null
  reconciliated_cases: number | null
  reconciliated_units: number | null
}

type InvItem = {
  brand_code: string
  brand_name: string
  bpu: number
  category: string | null
  category1: string | null
}

type Team = { id: string; team_name: string }

type Props = {
  sessionId: string
  teams: Team[]
  reconcItems: ReconcItem[]
  inventory: InvItem[]
  isConfirmed: boolean
}

const TD = 'px-3 py-2.5 text-center font-mono text-sm'
const TH_SUB = 'px-2 pb-2 pt-1 border-b-2 border-slate-300 text-center text-[10px] font-semibold uppercase tracking-wide'

function val(v: number | null) {
  return v === null ? '—' : String(v)
}

export function CombinacaoClient({ sessionId, teams, reconcItems, inventory, isConfirmed }: Props) {
  const [activeTab, setActiveTab] = useState(teams[0]?.id ?? 'combinado')
  const [confirmed, setConfirmed] = useState(isConfirmed)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const invMap = Object.fromEntries(inventory.map((i) => [i.brand_code, i]))

  const reconcMap: Record<string, Record<string, ReconcItem>> = {}
  for (const item of reconcItems) {
    if (!reconcMap[item.team_id]) reconcMap[item.team_id] = {}
    reconcMap[item.team_id][item.brand_code] = item
  }

  const allCodes = [...new Set(reconcItems.map((r) => r.brand_code))].sort()

  function getMerged(code: string) {
    const bpu = invMap[code]?.bpu ?? 1
    const total = teams.reduce((s, t) => {
      const ri = reconcMap[t.id]?.[code]
      if (!ri) return s
      return ri.status === 'resolvido'
        ? s + (ri.reconciliated_cases ?? 0) * bpu + (ri.reconciliated_units ?? 0)
        : s + (ri.independente_cases ?? 0) * bpu + (ri.independente_units ?? 0)
    }, 0)
    return { cases: Math.floor(total / bpu), units: total % bpu }
  }

  function handleConfirmar() {
    setErro(null)
    startTransition(async () => {
      const res = await combinarSessao(sessionId)
      if (res.error) setErro(res.error)
      else { setConfirmed(true); router.refresh() }
    })
  }

  return (
    <div>
      <Link href={`/admin/sessao/${sessionId}/progresso`} className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-6">
        ← Progresso
      </Link>

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Combinação de Equipes</h1>
        <p className="text-sm text-slate-500 mt-1">
          {teams.length} equipe{teams.length !== 1 ? 's' : ''} reconciliada{teams.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {teams.map((t) => (
          <span key={t.id} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-green-100 text-green-700">
            ✓ {t.team_name}
          </span>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b-2 border-slate-200 flex">
        {teams.map((team) => (
          <button
            key={team.id}
            onClick={() => setActiveTab(team.id)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-[2px] transition-colors ${
              activeTab === team.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {team.team_name}
          </button>
        ))}
        <button
          onClick={() => setActiveTab('combinado')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-[2px] transition-colors ${
            activeTab === 'combinado'
              ? 'border-blue-700 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Combinado
        </button>
      </div>

      {/* ── Abas por equipe ──────────────────────────────────────────────── */}
      {teams.map((team) => (
        <div key={team.id} style={{ display: activeTab === team.id ? 'block' : 'none' }}>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mt-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th rowSpan={2} className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[120px]">Brand Category</th>
                    <th rowSpan={2} className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[120px]">Category 1</th>
                    <th rowSpan={2} className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[90px]">Brand Code</th>
                    <th rowSpan={2} className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[150px]">Brand Name</th>
                    <th rowSpan={2} className="px-3 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">BPU</th>
                    <th colSpan={2} className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-center text-[11px] font-semibold text-amber-800 uppercase tracking-wide">Independent</th>
                    <th colSpan={2} className="px-3 py-2 bg-blue-50 border-b border-blue-200 text-center text-[11px] font-semibold text-blue-800 uppercase tracking-wide">Count 1</th>
                    <th colSpan={2} className="px-3 py-2 bg-green-50 border-b border-green-200 text-center text-[11px] font-semibold text-green-800 uppercase tracking-wide">Count 2</th>
                    <th colSpan={2} className="px-3 py-2 bg-orange-50 border-b border-orange-200 text-center text-[11px] font-semibold text-orange-800 uppercase tracking-wide">Reconciliation*</th>
                  </tr>
                  <tr>
                    <th className={`${TH_SUB} bg-amber-50 text-amber-700`}>Cases</th>
                    <th className={`${TH_SUB} bg-amber-50 text-amber-700`}>Units</th>
                    <th className={`${TH_SUB} bg-blue-50 text-blue-700`}>Cases</th>
                    <th className={`${TH_SUB} bg-blue-50 text-blue-700`}>Units</th>
                    <th className={`${TH_SUB} bg-green-50 text-green-700`}>Cases</th>
                    <th className={`${TH_SUB} bg-green-50 text-green-700`}>Units</th>
                    <th className={`${TH_SUB} bg-orange-50 text-orange-700`}>Cases</th>
                    <th className={`${TH_SUB} bg-orange-50 text-orange-700`}>Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allCodes
                    .filter((code) => reconcMap[team.id]?.[code])
                    .map((code) => {
                      const ri = reconcMap[team.id][code]
                      const inv = invMap[code]
                      const isResolvido = ri.status === 'resolvido'
                      return (
                        <tr key={code} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-xs text-slate-500">{inv?.category ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{inv?.category1 ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-700">{code}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{inv?.brand_name ?? '—'}</td>
                          <td className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500">{inv?.bpu ?? '—'}</td>
                          <td className={TD}>{val(ri.independente_cases)}</td>
                          <td className={TD}>{val(ri.independente_units)}</td>
                          <td className={TD}>{val(ri.contador_1_cases)}</td>
                          <td className={TD}>{val(ri.contador_1_units)}</td>
                          <td className={TD}>{val(ri.contador_2_cases)}</td>
                          <td className={TD}>{val(ri.contador_2_units)}</td>
                          <td className={`${TD} ${isResolvido ? 'text-orange-600 font-bold' : 'text-slate-300'}`}>
                            {isResolvido ? val(ri.reconciliated_cases) : '—'}
                          </td>
                          <td className={`${TD} ${isResolvido ? 'text-orange-600 font-bold' : 'text-slate-300'}`}>
                            {isResolvido ? val(ri.reconciliated_units) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 flex gap-6 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300 inline-block" />
              Reconciliation* laranja: discrepância resolvida — valor usado no Merged
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-3 h-3 rounded bg-slate-100 border border-slate-200 inline-block" />
              Reconciliation* com —: todos os 3 concordaram — independente usado no Merged
            </div>
          </div>
        </div>
      ))}

      {/* ── Aba Combinado ────────────────────────────────────────────────── */}
      <div style={{ display: activeTab === 'combinado' ? 'block' : 'none' }}>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mt-5">
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  <th rowSpan={3} className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[120px]">Brand Category</th>
                  <th rowSpan={3} className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[120px]">Category 1</th>
                  <th rowSpan={3} className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[90px]">Brand Code</th>
                  <th rowSpan={3} className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[150px]">Brand Name</th>
                  <th rowSpan={3} className="px-3 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">BPU</th>
                  {teams.map((team, i) => (
                    <th key={team.id} colSpan={8}
                      className={`px-3 py-2 border-l-2 border-slate-300 border-b text-center text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ${
                        i % 2 === 0 ? 'bg-blue-50 text-blue-800' : 'bg-purple-50 text-purple-800'
                      }`}
                    >
                      {team.team_name}
                    </th>
                  ))}
                  <th colSpan={2} rowSpan={2}
                    className="px-3 py-2 bg-green-100 border-l-2 border-slate-300 border-b-2 border-slate-300 text-center text-[11px] font-bold text-green-800 uppercase tracking-wide align-middle whitespace-nowrap"
                  >
                    Merged Count
                  </th>
                </tr>
                <tr>
                  {teams.map((team) => (
                    <Fragment key={team.id}>
                      <th colSpan={2} className="px-2 py-1 border-l-2 border-slate-300 border-b bg-amber-50 text-amber-700 text-center text-[10px] font-semibold uppercase tracking-wide">Independent</th>
                      <th colSpan={2} className="px-2 py-1 border-b bg-blue-50 text-blue-700 text-center text-[10px] font-semibold uppercase tracking-wide">Count 1</th>
                      <th colSpan={2} className="px-2 py-1 border-b bg-green-50 text-green-700 text-center text-[10px] font-semibold uppercase tracking-wide">Count 2</th>
                      <th colSpan={2} className="px-2 py-1 border-b bg-orange-50 text-orange-700 text-center text-[10px] font-semibold uppercase tracking-wide">Reconciliation*</th>
                    </Fragment>
                  ))}
                </tr>
                <tr>
                  {teams.map((team) => (
                    <Fragment key={team.id}>
                      <th className={`${TH_SUB} bg-amber-50 text-amber-600 border-l-2 border-slate-300`}>Cases</th>
                      <th className={`${TH_SUB} bg-amber-50 text-amber-600`}>Units</th>
                      <th className={`${TH_SUB} bg-blue-50 text-blue-600`}>Cases</th>
                      <th className={`${TH_SUB} bg-blue-50 text-blue-600`}>Units</th>
                      <th className={`${TH_SUB} bg-green-50 text-green-600`}>Cases</th>
                      <th className={`${TH_SUB} bg-green-50 text-green-600`}>Units</th>
                      <th className={`${TH_SUB} bg-orange-50 text-orange-600`}>Cases</th>
                      <th className={`${TH_SUB} bg-orange-50 text-orange-600`}>Units</th>
                    </Fragment>
                  ))}
                  <th className={`${TH_SUB} bg-green-100 text-green-700`}>Cases</th>
                  <th className={`${TH_SUB} bg-green-100 text-green-700`}>Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allCodes.map((code) => {
                  const inv = invMap[code]
                  const merged = getMerged(code)
                  return (
                    <tr key={code} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{inv?.category ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{inv?.category1 ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs font-bold text-slate-700 whitespace-nowrap">{code}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">{inv?.brand_name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500">{inv?.bpu ?? '—'}</td>
                      {teams.map((team) => {
                        const ri = reconcMap[team.id]?.[code]
                        const isResolvido = ri?.status === 'resolvido'
                        return (
                          <Fragment key={team.id}>
                            <td className={`${TD} border-l-2 border-slate-100`}>{ri ? val(ri.independente_cases) : <span className="text-slate-200">—</span>}</td>
                            <td className={TD}>{ri ? val(ri.independente_units) : <span className="text-slate-200">—</span>}</td>
                            <td className={TD}>{ri ? val(ri.contador_1_cases) : <span className="text-slate-200">—</span>}</td>
                            <td className={TD}>{ri ? val(ri.contador_1_units) : <span className="text-slate-200">—</span>}</td>
                            <td className={TD}>{ri ? val(ri.contador_2_cases) : <span className="text-slate-200">—</span>}</td>
                            <td className={TD}>{ri ? val(ri.contador_2_units) : <span className="text-slate-200">—</span>}</td>
                            <td className={`${TD} ${ri && isResolvido ? 'text-orange-600 font-bold' : 'text-slate-300'}`}>
                              {ri ? (isResolvido ? val(ri.reconciliated_cases) : '—') : <span className="text-slate-200">—</span>}
                            </td>
                            <td className={`${TD} ${ri && isResolvido ? 'text-orange-600 font-bold' : 'text-slate-300'}`}>
                              {ri ? (isResolvido ? val(ri.reconciliated_units) : '—') : <span className="text-slate-200">—</span>}
                            </td>
                          </Fragment>
                        )
                      })}
                      <td className={`${TD} bg-green-50 border-l-2 border-slate-200 text-green-700 font-bold`}>{merged.cases}</td>
                      <td className={`${TD} bg-green-50 text-green-700 font-bold`}>{merged.units}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Confirm bar */}
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-4 flex-wrap">
            {confirmed ? (
              <span className="text-sm font-semibold text-green-700 flex items-center gap-2">
                ✓ Combinação confirmada e salva
              </span>
            ) : (
              <>
                <span className="text-sm text-slate-500">
                  {teams.length} equipe{teams.length !== 1 ? 's' : ''} reconciliada{teams.length !== 1 ? 's' : ''}.
                  Confirme para salvar.
                </span>
                <button
                  onClick={handleConfirmar}
                  disabled={isPending}
                  className="bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {isPending ? 'Salvando...' : 'Confirmar Combinação →'}
                </button>
              </>
            )}
          </div>
          {erro && <div className="px-6 pb-4 text-sm text-red-600">{erro}</div>}
        </div>
      </div>
    </div>
  )
}
