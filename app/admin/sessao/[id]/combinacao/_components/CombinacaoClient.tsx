'use client'

import { Fragment, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { combinarSessao } from '@/actions/combinacao'
import { finalizarEquipe } from '@/actions/reconciliacao'
import { limparContagens } from '@/actions/sessao'

type EntryRow = {
  team_id: string
  counter_role: string
  brand_code: string
  final_cases: number
  final_units: number
}

type ReconcRow = {
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

type Counter = {
  id: string
  role: string
  full_name: string | null
  finalized_at: string | null
  entry_count: number
}

type Team = {
  id: string
  team_name: string
  status: string
  counters: Counter[]
}

type InvItem = {
  brand_code: string
  brand_name: string
  bpu: number
  category: string | null
  category1: string | null
}

type Props = {
  sessionId: string
  sessionStatus: string
  sessionCreatedAt: string
  teams: Team[]
  initialEntries: EntryRow[]
  initialReconc: ReconcRow[]
  inventory: InvItem[]
  isConfirmed: boolean
  counters: Record<string, Record<string, string>>
}

const TD = 'px-3 py-2.5 text-center font-mono text-sm'
const TH_SUB =
  'px-2 pb-2 pt-1 border-b-2 border-slate-300 text-center text-[10px] font-semibold uppercase tracking-wide'
const roleLabel: Record<string, string> = {
  contador_1: 'C1',
  contador_2: 'C2',
  independente: 'Ind',
}

function val(v: number | null) {
  return v === null ? '—' : String(v)
}

function sumRole(
  rows: EntryRow[],
  code: string,
  role: string,
  bpu: number,
): { cases: number; units: number } | null {
  const rs = rows.filter((e) => e.brand_code === code && e.counter_role === role)
  if (!rs.length) return null
  const t = rs.reduce((s, e) => s + e.final_cases * bpu + e.final_units, 0)
  return { cases: Math.floor(t / bpu), units: t % bpu }
}

function fmtVal(v: { cases: number; units: number } | null) {
  return v ? `${v.cases}+${v.units}` : '—'
}

export function CombinacaoClient({
  sessionId,
  sessionStatus,
  sessionCreatedAt,
  teams: initTeams,
  initialEntries,
  initialReconc,
  inventory,
  isConfirmed,
  counters,
}: Props) {
  const [teams, setTeams] = useState(initTeams)
  const [entries, setEntries] = useState(initialEntries)
  const [reconc, setReconc] = useState(initialReconc)
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set())
  const [loadingTeam, setLoadingTeam] = useState<string | null>(null)
  const [clearingTeamId, setClearingTeamId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(initTeams[0]?.id ?? 'combinado')
  const [confirmed, setConfirmed] = useState(isConfirmed)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const tids = new Set(initTeams.map((t) => t.id))
    let mounted = true
    let channel: ReturnType<typeof supabase.channel>

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)

      channel = supabase
        .channel(`progresso-${sessionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'count_entries' },
          ({ new: row }) => {
            const r = row as EntryRow
            if (!tids.has(r.team_id)) return
            setEntries((p) => [
              ...p.filter(
                (e) =>
                  !(
                    e.team_id === r.team_id &&
                    e.counter_role === r.counter_role &&
                    e.brand_code === r.brand_code
                  ),
              ),
              r,
            ])
            const k = `${r.team_id}:${r.brand_code}`
            setNewKeys((p) => new Set([...p, k]))
            setTimeout(
              () =>
                setNewKeys((p) => {
                  const n = new Set(p)
                  n.delete(k)
                  return n
                }),
              1500,
            )
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reconciliation_items' },
          ({ new: row }) => {
            const r = row as ReconcRow
            if (!tids.has(r.team_id)) return
            setReconc((p) => [
              ...p.filter(
                (x) => !(x.team_id === r.team_id && x.brand_code === r.brand_code),
              ),
              r,
            ])
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'teams' },
          ({ new: row }) => {
            const r = row as { id: string; status: string }
            if (!tids.has(r.id)) return
            setTeams((p) =>
              p.map((t) => (t.id === r.id ? { ...t, status: r.status } : t)),
            )
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'counter_accounts' },
          ({ new: row }) => {
            const r = row as { id: string; finalized_at: string | null }
            setTeams((p) =>
              p.map((t) => ({
                ...t,
                counters: t.counters.map((c) =>
                  c.id === r.id ? { ...c, finalized_at: r.finalized_at } : c,
                ),
              }))
            )
          },
        )
        .subscribe()
    })

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [sessionId])

  const invMap = Object.fromEntries(inventory.map((i) => [i.brand_code, i]))

  const reconcMap: Record<string, Record<string, ReconcRow>> = {}
  for (const r of reconc) {
    if (!reconcMap[r.team_id]) reconcMap[r.team_id] = {}
    reconcMap[r.team_id][r.brand_code] = r
  }

  const reconcilidaTeams = teams.filter((t) => t.status === 'reconciliada')
  const reconcilidaIds = new Set(reconcilidaTeams.map((t) => t.id))
  const hasReconciliada = reconcilidaTeams.length > 0
  const allReconciliada =
    teams.length > 0 && teams.every((t) => t.status === 'reconciliada')

  const totalCounters = teams.reduce(
    (s, t) => s + t.counters.filter((c) => c.role !== 'independente').length,
    0,
  )
  const finalizedCounters = teams.reduce(
    (s, t) => s + t.counters.filter((c) => c.role !== 'independente' && !!c.finalized_at).length,
    0,
  )

  const reconcCodes = [
    ...new Set(
      reconc.filter((r) => reconcilidaIds.has(r.team_id)).map((r) => r.brand_code),
    ),
  ].sort()

  function cName(teamId: string, role: string, fallback: string) {
    const name = counters[teamId]?.[role]
    return name ? `${fallback}: ${name}` : fallback
  }

  function getMerged(code: string) {
    const bpu = invMap[code]?.bpu ?? 1
    const total = reconcilidaTeams.reduce((s, t) => {
      const ri = reconcMap[t.id]?.[code]
      if (!ri) return s
      if (ri.status === 'resolvido') {
        return s + (ri.reconciliated_cases ?? 0) * bpu + (ri.reconciliated_units ?? 0)
      }
      if (ri.independente_cases !== null) {
        return s + ri.independente_cases * bpu + (ri.independente_units ?? 0)
      }
      // ponytail: C1=C2, no discrepancy — C1 is official
      return s + (ri.contador_1_cases ?? 0) * bpu + (ri.contador_1_units ?? 0)
    }, 0)
    return { cases: Math.floor(total / bpu), units: total % bpu }
  }

  async function handleFinalizarEquipe(teamId: string) {
    setLoadingTeam(teamId)
    await finalizarEquipe(teamId)
    setLoadingTeam(null)
  }

  async function handleClearCounts(teamId: string) {
    setClearingTeamId(teamId)
    await limparContagens(teamId)
    setEntries((p) => p.filter((e) => e.team_id !== teamId))
    setReconc((p) => p.filter((r) => r.team_id !== teamId))
    setTeams((p) =>
      p.map((t) =>
        t.id === teamId
          ? { ...t, status: 'contando', counters: t.counters.map((c) => ({ ...c, finalized_at: null })) }
          : t,
      ),
    )
    setClearingTeamId(null)
  }

  function handleConfirmar() {
    setErro(null)
    startTransition(async () => {
      const res = await combinarSessao(sessionId)
      if (res.error) setErro(res.error)
      else {
        setConfirmed(true)
        router.refresh()
      }
    })
  }

  const dateStr = sessionCreatedAt
    ? new Date(sessionCreatedAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—'

  return (
    <>
      <style>{`
        @keyframes rowFlash { from { background-color: rgb(219 234 254); } to { background-color: transparent; } }
        .row-flash { animation: rowFlash 1.5s ease-out forwards; }
      `}</style>

      <div className="fixed inset-x-0 bottom-0 flex flex-col bg-slate-50" style={{ top: '48px' }}>

        {/* ── Page header bar ──────────────────────────────────────────── */}
        <div className="flex-none h-14 bg-slate-900 flex items-center justify-between px-4 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/admin"
              className="text-slate-400 hover:text-white text-sm flex-shrink-0"
            >
              ← Dashboard
            </Link>
            <span className="text-slate-600 flex-shrink-0">|</span>
            <span className="font-bold text-white text-sm truncate">Live Count</span>
            <span className="text-slate-500 text-xs hidden sm:inline flex-shrink-0">
              {dateStr} · {sessionStatus}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              {allReconciliada
                ? '✓ All teams reconciled'
                : `${finalizedCounters}/${totalCounters} finalised`}
            </div>
            {hasReconciliada && (
              <a
                href={`/api/sessao/${sessionId}/export`}
                className="text-xs font-semibold text-slate-300 border border-slate-600 hover:border-slate-400 rounded-lg px-3 py-1.5 whitespace-nowrap"
              >
                ↓ Excel
              </a>
            )}
            <Link
              href={`/admin/sessao/${sessionId}/equipes`}
              className="text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5 whitespace-nowrap hidden sm:inline-flex"
            >
              Teams
            </Link>
          </div>
        </div>

        {/* ── Teams strip ──────────────────────────────────────────────── */}
        <div className="flex-none h-12 bg-slate-800 border-b border-slate-700 flex items-center gap-2 px-3 overflow-x-auto">
          {teams.map((team) => {
            const allFin =
              team.counters.filter((c) => c.role !== 'independente').length > 0 &&
              team.counters.filter((c) => c.role !== 'independente').every((c) => c.finalized_at)
            const isReconciliando = team.status === 'reconciliando'
            const isReconciliada = team.status === 'reconciliada'
            const isLoading = loadingTeam === team.id

            return (
              <div
                key={team.id}
                className={`inline-flex items-center gap-1.5 flex-shrink-0 text-xs rounded-full px-3 py-1.5 border ${
                  isReconciliada
                    ? 'bg-green-950 border-green-700 text-green-300'
                    : allFin || isReconciliando
                      ? 'bg-amber-950 border-amber-700 text-amber-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                <span className="font-bold">{team.team_name}</span>
                {isReconciliada && <span className="text-green-400 font-bold">✓</span>}
                {isReconciliando && (
                  <Link
                    href={`/admin/sessao/${sessionId}/reconciliacao/${team.id}`}
                    className="text-[10px] font-bold bg-amber-500 text-amber-950 rounded px-1.5 py-0.5"
                  >
                    Monitor →
                  </Link>
                )}
                {!isReconciliando && !isReconciliada && allFin && (
                  <button
                    onClick={() => handleFinalizarEquipe(team.id)}
                    disabled={isLoading}
                    className="text-[10px] font-bold bg-amber-500 text-amber-950 rounded px-1.5 py-0.5 disabled:opacity-50"
                  >
                    {isLoading ? '...' : 'Check →'}
                  </button>
                )}
              </div>
            )
          })}
          {teams.length === 0 && (
            <span className="text-xs text-slate-500">No teams created.</span>
          )}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex-none bg-white border-b-2 border-slate-200 flex overflow-x-auto">
          {teams.map((team) => {
            const isReconciliada = team.status === 'reconciliada'
            const allFin =
              team.counters.filter((c) => c.role !== 'independente').length > 0 &&
              team.counters.filter((c) => c.role !== 'independente').every((c) => c.finalized_at)
            return (
              <button
                key={team.id}
                onClick={() => setActiveTab(team.id)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-[2px] flex items-center gap-1.5 whitespace-nowrap transition-colors flex-shrink-0 ${
                  activeTab === team.id
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    isReconciliada
                      ? 'bg-green-500'
                      : allFin
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-slate-300'
                  }`}
                />
                {team.team_name}
              </button>
            )
          })}
          {hasReconciliada && (
            <button
              onClick={() => setActiveTab('combinado')}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-[2px] whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTab === 'combinado'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Merged
            </button>
          )}
        </div>

        {/* ── Table container — internal scroll ────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-auto bg-white">

          {teams.length === 0 && (
            <div className="px-4 py-12 text-sm text-slate-400 text-center">
              No teams created in this session.
            </div>
          )}

          {/* Per-team tabs */}
          {teams.map((team) => {
            const isReconciliada = team.status === 'reconciliada'
            const te = entries.filter((e) => e.team_id === team.id)
            const teamReconc = reconc.filter((r) => r.team_id === team.id)
            const liveCodes = [...new Set(te.map((e) => e.brand_code))].sort()
            const reconcTeamCodes = [...new Set(teamReconc.map((r) => r.brand_code))].sort()

            return (
              <div
                key={team.id}
                style={{ display: activeTab === team.id ? 'block' : 'none' }}
              >
                {isReconciliada ? (
                  /* ── Reconciliation view (reconciliada teams) ─────────── */
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th
                          rowSpan={2}
                          className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[100px]"
                        >
                          Category
                        </th>
                        <th
                          rowSpan={2}
                          className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[100px]"
                        >
                          Category 1
                        </th>
                        <th
                          rowSpan={2}
                          className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[80px]"
                        >
                          Brand Code
                        </th>
                        <th
                          rowSpan={2}
                          className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[140px]"
                        >
                          Brand Name
                        </th>
                        <th
                          rowSpan={2}
                          className="px-3 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-center text-xs font-semibold text-slate-500 uppercase"
                        >
                          BPU
                        </th>
                        <th
                          colSpan={2}
                          className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-center text-[11px] font-semibold text-amber-800 uppercase"
                        >
                          {cName(team.id, 'independente', 'Independent')}
                        </th>
                        <th
                          colSpan={2}
                          className="px-3 py-2 bg-blue-50 border-b border-blue-200 text-center text-[11px] font-semibold text-blue-800 uppercase"
                        >
                          {cName(team.id, 'contador_1', 'Count 1')}
                        </th>
                        <th
                          colSpan={2}
                          className="px-3 py-2 bg-green-50 border-b border-green-200 text-center text-[11px] font-semibold text-green-800 uppercase"
                        >
                          {cName(team.id, 'contador_2', 'Count 2')}
                        </th>
                        <th
                          colSpan={2}
                          className="px-3 py-2 bg-orange-50 border-b border-orange-200 text-center text-[11px] font-semibold text-orange-800 uppercase"
                        >
                          Reconciliation*
                        </th>
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
                      {reconcTeamCodes.map((code) => {
                        const ri = reconcMap[team.id]?.[code]
                        if (!ri) return null
                        const inv = invMap[code]
                        const isResolvido = ri.status === 'resolvido'
                        return (
                          <tr key={code} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 text-xs text-slate-500">
                              {inv?.category ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">
                              {inv?.category1 ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs font-bold text-slate-700">
                              {code}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600">
                              {inv?.brand_name ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500">
                              {inv?.bpu ?? '—'}
                            </td>
                            <td className={TD}>{val(ri.independente_cases)}</td>
                            <td className={TD}>{val(ri.independente_units)}</td>
                            <td className={TD}>{val(ri.contador_1_cases)}</td>
                            <td className={TD}>{val(ri.contador_1_units)}</td>
                            <td className={TD}>{val(ri.contador_2_cases)}</td>
                            <td className={TD}>{val(ri.contador_2_units)}</td>
                            <td
                              className={`${TD} ${
                                isResolvido ? 'text-orange-600 font-bold' : 'text-slate-300'
                              }`}
                            >
                              {isResolvido ? val(ri.reconciliated_cases) : '—'}
                            </td>
                            <td
                              className={`${TD} ${
                                isResolvido ? 'text-orange-600 font-bold' : 'text-slate-300'
                              }`}
                            >
                              {isResolvido ? val(ri.reconciliated_units) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  /* ── Live count view (counting / reconciliando teams) ─── */
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={5} className="px-4 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex gap-2 flex-wrap">
                              {team.counters.filter((c) => c.role !== 'independente').map((c) => (
                                <span
                                  key={c.id}
                                  className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ${
                                    c.finalized_at
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  <span className="font-bold">
                                    {roleLabel[c.role] ?? c.role}
                                  </span>
                                  {c.full_name && <span>{c.full_name}</span>}
                                  <span>
                                    {c.finalized_at
                                      ? ' ✓'
                                      : ` · ${
                                          te.filter((e) => e.counter_role === c.role).length
                                        } items`}
                                  </span>
                                </span>
                              ))}
                            </div>
                            <button
                              onClick={() => handleClearCounts(team.id)}
                              disabled={clearingTeamId === team.id}
                              className="text-xs text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-300 rounded-lg px-2 py-1 whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                            >
                              {clearingTeamId === team.id ? '...' : 'Clear Counts'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className="bg-slate-50 border-b-2 border-slate-300">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                          Item
                        </th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                          C1
                        </th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                          C2
                        </th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                          Ind
                        </th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {liveCodes.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-12 text-xs text-slate-400 text-center"
                          >
                            Waiting for first counts...
                          </td>
                        </tr>
                      ) : (
                        liveCodes.map((code) => {
                          const bpu = invMap[code]?.bpu ?? 1
                          const c1 = sumRole(te, code, 'contador_1', bpu)
                          const c2 = sumRole(te, code, 'contador_2', bpu)
                          const ind = sumRole(te, code, 'independente', bpu)
                          const rRows = reconc.filter(
                            (r) => r.team_id === team.id && r.brand_code === code,
                          )
                          const rStatus = rRows.length
                            ? rRows.some((r) => r.status === 'discrepancia')
                              ? 'discrepancia'
                              : rRows.every((r) => r.status === 'combinado')
                                ? 'combinado'
                                : 'resolvido'
                            : null
                          const isNew = newKeys.has(`${team.id}:${code}`)
                          return (
                            <tr
                              key={code}
                              className={`${
                                isNew
                                  ? 'row-flash'
                                  : rStatus === 'combinado' || rStatus === 'resolvido'
                                    ? 'bg-green-50'
                                    : rStatus === 'discrepancia'
                                      ? 'bg-amber-50'
                                      : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="px-4 py-2.5">
                                <div className="font-semibold text-slate-800 text-xs">
                                  {code}
                                </div>
                                <div className="text-xs text-slate-400 truncate max-w-[200px] lg:max-w-none">
                                  {invMap[code]?.brand_name ?? ''}
                                </div>
                              </td>
                              {[c1, c2, ind].map((v, i) => (
                                <td
                                  key={i}
                                  className={`px-3 py-2.5 text-center font-mono text-sm ${
                                    v ? 'text-slate-800 font-semibold' : 'text-slate-300'
                                  }`}
                                >
                                  {fmtVal(v)}
                                </td>
                              ))}
                              <td className="px-3 py-2.5 text-center text-base">
                                {rStatus === 'combinado' && (
                                  <span className="text-green-500">✓</span>
                                )}
                                {rStatus === 'resolvido' && (
                                  <span className="text-green-500 text-xs font-bold">OK</span>
                                )}
                                {rStatus === 'discrepancia' && (
                                  <span className="text-amber-500">⚠</span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}

          {/* ── Merged tab ────────────────────────────────────────────── */}
          <div style={{ display: activeTab === 'combinado' ? 'block' : 'none' }}>
            <table className="text-sm border-collapse w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th
                    rowSpan={3}
                    className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[100px]"
                  >
                    Category
                  </th>
                  <th
                    rowSpan={3}
                    className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[100px]"
                  >
                    Category 1
                  </th>
                  <th
                    rowSpan={3}
                    className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[80px]"
                  >
                    Brand Code
                  </th>
                  <th
                    rowSpan={3}
                    className="text-left px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[140px]"
                  >
                    Brand Name
                  </th>
                  <th
                    rowSpan={3}
                    className="px-3 py-2.5 bg-slate-50 border-b-2 border-slate-300 text-center text-xs font-semibold text-slate-500 uppercase"
                  >
                    BPU
                  </th>
                  {reconcilidaTeams.map((team, i) => (
                    <th
                      key={team.id}
                      colSpan={8}
                      className={`px-3 py-2 border-l-2 border-slate-300 border-b text-center text-[11px] font-bold uppercase whitespace-nowrap ${
                        i % 2 === 0
                          ? 'bg-blue-50 text-blue-800'
                          : 'bg-purple-50 text-purple-800'
                      }`}
                    >
                      {team.team_name}
                    </th>
                  ))}
                  <th
                    colSpan={2}
                    rowSpan={2}
                    className="px-3 py-2 bg-green-100 border-l-2 border-slate-300 border-b-2 border-b-slate-300 text-center text-[11px] font-bold text-green-800 uppercase align-middle whitespace-nowrap"
                  >
                    Merged Count
                  </th>
                </tr>
                <tr>
                  {reconcilidaTeams.map((team) => (
                    <Fragment key={team.id}>
                      <th
                        colSpan={2}
                        className="px-2 py-1 border-l-2 border-slate-300 border-b bg-amber-50 text-amber-700 text-center text-[10px] font-semibold uppercase"
                      >
                        {cName(team.id, 'independente', 'Independent')}
                      </th>
                      <th
                        colSpan={2}
                        className="px-2 py-1 border-b bg-blue-50 text-blue-700 text-center text-[10px] font-semibold uppercase"
                      >
                        {cName(team.id, 'contador_1', 'Count 1')}
                      </th>
                      <th
                        colSpan={2}
                        className="px-2 py-1 border-b bg-green-50 text-green-700 text-center text-[10px] font-semibold uppercase"
                      >
                        {cName(team.id, 'contador_2', 'Count 2')}
                      </th>
                      <th
                        colSpan={2}
                        className="px-2 py-1 border-b bg-orange-50 text-orange-700 text-center text-[10px] font-semibold uppercase"
                      >
                        Reconciliation*
                      </th>
                    </Fragment>
                  ))}
                </tr>
                <tr>
                  {reconcilidaTeams.map((team) => (
                    <Fragment key={team.id}>
                      <th
                        className={`${TH_SUB} bg-amber-50 text-amber-600 border-l-2 border-slate-300`}
                      >
                        Cases
                      </th>
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
                {reconcCodes.map((code) => {
                  const inv = invMap[code]
                  const merged = getMerged(code)
                  return (
                    <tr key={code} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {inv?.category ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {inv?.category1 ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-bold text-slate-700 whitespace-nowrap">
                        {code}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        {inv?.brand_name ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500">
                        {inv?.bpu ?? '—'}
                      </td>
                      {reconcilidaTeams.map((team) => {
                        const ri = reconcMap[team.id]?.[code]
                        const isResolvido = ri?.status === 'resolvido'
                        return (
                          <Fragment key={team.id}>
                            <td className={`${TD} border-l-2 border-slate-100`}>
                              {ri ? (
                                val(ri.independente_cases)
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                            <td className={TD}>
                              {ri ? (
                                val(ri.independente_units)
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                            <td className={TD}>
                              {ri ? (
                                val(ri.contador_1_cases)
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                            <td className={TD}>
                              {ri ? (
                                val(ri.contador_1_units)
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                            <td className={TD}>
                              {ri ? (
                                val(ri.contador_2_cases)
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                            <td className={TD}>
                              {ri ? (
                                val(ri.contador_2_units)
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                            <td
                              className={`${TD} ${
                                ri && isResolvido
                                  ? 'text-orange-600 font-bold'
                                  : 'text-slate-300'
                              }`}
                            >
                              {ri ? (
                                isResolvido ? (
                                  val(ri.reconciliated_cases)
                                ) : (
                                  '—'
                                )
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                            <td
                              className={`${TD} ${
                                ri && isResolvido
                                  ? 'text-orange-600 font-bold'
                                  : 'text-slate-300'
                              }`}
                            >
                              {ri ? (
                                isResolvido ? (
                                  val(ri.reconciliated_units)
                                ) : (
                                  '—'
                                )
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                          </Fragment>
                        )
                      })}
                      <td
                        className={`${TD} bg-green-50 border-l-2 border-slate-200 text-green-700 font-bold`}
                      >
                        {merged.cases}
                      </td>
                      <td className={`${TD} bg-green-50 text-green-700 font-bold`}>
                        {merged.units}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Confirm + export bar */}
            <div className="sticky bottom-0 px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                {confirmed ? (
                  <span className="text-sm font-semibold text-green-700">
                    ✓ Merge confirmed and saved
                  </span>
                ) : (
                  <>
                    <span className="text-sm text-slate-500">
                      {reconcilidaTeams.length} team{reconcilidaTeams.length !== 1 ? 's' : ''} reconciled. Confirm to save.
                    </span>
                    <button
                      onClick={handleConfirmar}
                      disabled={isPending || !allReconciliada}
                      className="bg-blue-700 text-white font-bold px-5 py-2 rounded-xl text-sm hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
                    >
                      {isPending ? 'Saving...' : 'Confirm Merge →'}
                    </button>
                  </>
                )}
              </div>
              <a
                href={`/api/sessao/${sessionId}/export`}
                className="text-sm font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl px-4 py-2 whitespace-nowrap"
              >
                ↓ Export Excel
              </a>
            </div>
            {erro && <div className="px-4 pb-3 text-sm text-red-600">{erro}</div>}
          </div>
        </div>
      </div>
    </>
  )
}
