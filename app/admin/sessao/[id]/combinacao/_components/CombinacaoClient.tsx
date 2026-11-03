'use client'

import { Fragment, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { combinarSessao } from '@/actions/combinacao'
import { finalizarEquipe } from '@/actions/reconciliacao'
import { limparContagens } from '@/actions/sessao'
import { Button, Notice, buttonClass } from '@/components/ui'

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
  independente_confirmed_at: string | null
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
  storedResults?: { brand_code: string; total_cases: number; total_units: number }[]
  inventory: InvItem[]
  isConfirmed: boolean
  counters: Record<string, Record<string, string>>
}

const TD = 'px-3 py-2 text-center font-display text-lg font-bold'
const TH_BASE = 'px-3 py-2.5 bg-ink text-ground text-left font-display text-[13px] font-bold uppercase tracking-[0.08em]'
const TH_GROUP = 'px-3 py-2 bg-ink-2 text-white border-l border-ink text-center font-display text-[13px] font-bold uppercase tracking-[0.08em] whitespace-nowrap'
const TH_SUB = 'px-2 py-1.5 bg-ground-2 text-ink-2 border-b border-line text-center font-display text-xs font-bold uppercase tracking-[0.08em]'
// Dark bar buttons (same look as the header's Log out).
const GHOST = 'inline-flex min-h-10 items-center gap-1.5 rounded-md border-[1.5px] border-ground px-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-ground no-underline hover:bg-white/10 whitespace-nowrap focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white'
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

export function CombinacaoClient({
  sessionId,
  sessionStatus,
  sessionCreatedAt,
  teams: initTeams,
  initialEntries,
  initialReconc,
  inventory,
  storedResults,
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
  // The workspace fills the screen below the app header, whatever height the header has.
  const [top, setTop] = useState(72)
  useEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const watch = new ResizeObserver(() => setTop(header.getBoundingClientRect().height))
    watch.observe(header)
    return () => watch.disconnect()
  }, [])
  // Chave estável: o servidor manda um array novo a cada refresh, mesmo com as mesmas equipes.
  const teamIdsKey = initTeams.map((t) => t.id).join(',')

  useEffect(() => {
    const supabase = createClient()
    const tids = new Set(teamIdsKey.split(','))
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
            const r = row as {
              id: string
              status: string
              independente_confirmed_at: string | null
            }
            if (!tids.has(r.id)) return
            setTeams((p) =>
              p.map((t) =>
                t.id === r.id
                  ? { ...t, status: r.status, independente_confirmed_at: r.independente_confirmed_at }
                  : t,
              ),
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
  }, [sessionId, teamIdsKey])

  const invMap = Object.fromEntries(inventory.map((i) => [i.brand_code, i]))

  const reconcMap: Record<string, Record<string, ReconcRow>> = {}
  for (const r of reconc) {
    if (!reconcMap[r.team_id]) reconcMap[r.team_id] = {}
    reconcMap[r.team_id][r.brand_code] = r
  }

  const reconcilidaTeams = teams.filter((t) => t.status === 'reconciliada')
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

  // ponytail: merge final lista todo o inventário; item não contado por nenhuma equipe = 0
  // (getMerged devolve {0,0} para código sem reconciliação). Não é imputado a nenhuma equipe.
  const reconcCodes = [...(storedResults ?? inventory).map((i) => i.brand_code)].sort()
  const storedMap = new Map(storedResults?.map(r => [r.brand_code, r]))

  function cName(teamId: string, role: string, fallback: string) {
    const name = counters[teamId]?.[role]
    return name ? `${fallback}: ${name}` : fallback
  }

  function getMerged(code: string) {
    if (storedResults) {
      const saved = storedMap.get(code)
      return { cases: saved?.total_cases ?? 0, units: saved?.total_units ?? 0 }
    }
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
          ? {
              ...t,
              status: 'contando',
              independente_confirmed_at: null,
              counters: t.counters.map((c) => ({ ...c, finalized_at: null })),
            }
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
      <div className="fixed inset-x-0 flex flex-col bg-ground" style={{ top, bottom: 'var(--bottom-bar)' }}>

        {/* ── Page header bar ───────────────────────────── */}
        <div className="flex min-h-14 flex-none flex-wrap items-center justify-between gap-3 bg-ink px-4 py-2 text-ground">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin" className={GHOST}>← Home</Link>
            <h1 className="m-0 truncate font-display text-xl font-bold uppercase tracking-[0.04em]">Live Count</h1>
            <span className="hidden flex-shrink-0 text-sm text-on-ink-2 sm:inline">{dateStr} · {sessionStatus === 'fechada' ? 'Closed' : 'Open'}</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-on-ink-2">
              <span className="cs-live size-2.5 rounded-full bg-white" />
              {allReconciliada ? '✓ All teams reconciled' : `${finalizedCounters}/${totalCounters} finalised`}
            </span>
            {hasReconciliada && <a href={`/api/sessao/${sessionId}/export`} className={GHOST}>Excel</a>}
            <Link href={`/admin/sessao/${sessionId}/equipes`} className={GHOST + ' hidden sm:inline-flex'}>Teams</Link>
          </div>
        </div>

        {/* ── Teams strip ─────────────────────────────── */}
        <div className="flex min-h-14 flex-none items-center gap-2 overflow-x-auto border-t border-ink-2 bg-ink px-3 py-2">
          {teams.map((team) => {
            const c1c2Fin =
              team.counters.filter((c) => c.role !== 'independente').length > 0 &&
              team.counters.filter((c) => c.role !== 'independente').every((c) => c.finalized_at)
            const indConfirmed = !!team.independente_confirmed_at
            const isReconciliando = team.status === 'reconciliando'
            const isReconciliada = team.status === 'reconciliada'
            const isLoading = loadingTeam === team.id
            const mini = 'rounded-sm bg-white px-2.5 py-1 text-xs font-bold text-ink disabled:opacity-50'

            return (
              <div
                key={team.id}
                className={`inline-flex flex-shrink-0 items-center gap-2 rounded-md border-[1.5px] px-3 py-1.5 text-sm ${
                  isReconciliada
                    ? 'border-ok bg-ok text-white'
                    : c1c2Fin || isReconciliando
                      ? 'border-diff bg-diff text-white'
                      : 'border-ink-3 text-on-ink-2'
                }`}
              >
                <span className="font-display text-base font-bold uppercase tracking-[0.04em]">{team.team_name}</span>
                {isReconciliada && <span className="font-bold">✓</span>}
                {isReconciliando && (
                  <Link href={`/admin/sessao/${sessionId}/reconciliacao/${team.id}`} className={mini + ' no-underline'}>Monitor →</Link>
                )}
                {!isReconciliando && !isReconciliada && c1c2Fin && indConfirmed && (
                  <button onClick={() => handleFinalizarEquipe(team.id)} disabled={isLoading} className={mini}>
                    {isLoading ? '...' : 'Check →'}
                  </button>
                )}
                {!isReconciliando && !isReconciliada && c1c2Fin && !indConfirmed && (
                  <button
                    onClick={() => handleFinalizarEquipe(team.id)}
                    disabled={isLoading}
                    className="rounded-sm border border-white/60 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
                    title="Independent has not confirmed yet"
                  >
                    {isLoading ? '...' : 'Force →'}
                  </button>
                )}
              </div>
            )
          })}
          {teams.length === 0 && <span className="text-sm text-on-ink-2">No teams created.</span>}
        </div>

        {/* ── Tabs ────────────────────────────────── */}
        <div className="flex flex-none overflow-x-auto border-b-2 border-line bg-surface">
          {teams.map((team) => {
            const isReconciliada = team.status === 'reconciliada'
            const c1c2Fin =
              team.counters.filter((c) => c.role !== 'independente').length > 0 &&
              team.counters.filter((c) => c.role !== 'independente').every((c) => c.finalized_at)
            return (
              <button
                key={team.id}
                onClick={() => setActiveTab(team.id)}
                className={`min-h-11 px-4 font-display text-base font-bold uppercase tracking-[0.04em] border-b-[3px] -mb-[2px] flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                  activeTab === team.id
                    ? 'border-ink text-ink'
                    : 'border-transparent text-ink-3 hover:text-ink'
                }`}
              >
                <span
                  className={`size-2 rounded-full flex-shrink-0 ${
                    isReconciliada
                      ? 'bg-ok'
                      : c1c2Fin
                        ? 'bg-diff animate-pulse'
                        : 'bg-line-2'
                  }`}
                />
                {team.team_name}
              </button>
            )
          })}
          {hasReconciliada && (
            <button
              onClick={() => setActiveTab('combinado')}
              className={`min-h-11 px-4 font-display text-base font-bold uppercase tracking-[0.04em] border-b-[3px] -mb-[2px] whitespace-nowrap flex-shrink-0 ${
                activeTab === 'combinado'
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              Merged
            </button>
          )}
        </div>

        {/* ── Table container ─ internal scroll ─────────────── */}
        <div className="min-h-0 flex-1 overflow-auto bg-surface">

          {teams.length === 0 && (
            <div className="px-4 py-12 text-center text-[15px] text-ink-2">
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
                  /* ── Reconciliation view (reconciliada teams) ───────── */
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th rowSpan={2} className={TH_BASE + ' min-w-[100px]'}>Category</th>
                        <th rowSpan={2} className={TH_BASE + ' min-w-[100px]'}>Category 1</th>
                        <th rowSpan={2} className={TH_BASE + ' min-w-[80px]'}>Brand Code</th>
                        <th rowSpan={2} className={TH_BASE + ' min-w-[140px]'}>Brand Name</th>
                        <th rowSpan={2} className={TH_BASE + ' text-center'}>BPU</th>
                        <th colSpan={2} className={TH_GROUP}>{cName(team.id, 'independente', 'Independent')}</th>
                        <th colSpan={2} className={TH_GROUP}>{cName(team.id, 'contador_1', 'Count 1')}</th>
                        <th colSpan={2} className={TH_GROUP}>{cName(team.id, 'contador_2', 'Count 2')}</th>
                        <th colSpan={2} className={TH_GROUP}>Reconciliation*</th>
                      </tr>
                      <tr>
                        <th className={TH_SUB}>Cases</th>
                        <th className={TH_SUB}>Units</th>
                        <th className={TH_SUB}>Cases</th>
                        <th className={TH_SUB}>Units</th>
                        <th className={TH_SUB}>Cases</th>
                        <th className={TH_SUB}>Units</th>
                        <th className={TH_SUB}>Cases</th>
                        <th className={TH_SUB}>Units</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ground-2">
                      {reconcTeamCodes.map((code) => {
                        const ri = reconcMap[team.id]?.[code]
                        if (!ri) return null
                        const inv = invMap[code]
                        const isResolvido = ri.status === 'resolvido'
                        return (
                          <tr key={code} className="hover:bg-ground">
                            <td className="px-3 py-2 text-xs text-ink-2">{inv?.category ?? '—'}</td>
                            <td className="px-3 py-2 text-xs text-ink-2">{inv?.category1 ?? '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs font-semibold">{code}</td>
                            <td className="px-3 py-2 text-sm">{inv?.brand_name ?? '—'}</td>
                            <td className="px-3 py-2 text-center text-xs font-semibold text-ink-2">{inv?.bpu ?? '—'}</td>
                            <td className={TD}>{val(ri.independente_cases)}</td>
                            <td className={TD}>{val(ri.independente_units)}</td>
                            <td className={TD}>{val(ri.contador_1_cases)}</td>
                            <td className={TD}>{val(ri.contador_1_units)}</td>
                            <td className={TD}>{val(ri.contador_2_cases)}</td>
                            <td className={TD}>{val(ri.contador_2_units)}</td>
                            <td className={`${TD} ${isResolvido ? 'text-info font-bold' : 'text-ink-3'}`}>{isResolvido ? val(ri.reconciliated_cases) : '—'}</td>
                            <td className={`${TD} ${isResolvido ? 'text-info font-bold' : 'text-ink-3'}`}>{isResolvido ? val(ri.reconciliated_units) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  /* ── Live count view (counting / reconciliando teams) ─── */
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-line bg-ground">
                        <td colSpan={12} className="px-4 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex gap-2 flex-wrap">
                              {team.counters.filter((c) => c.role !== 'independente').map((c) => (
                                <span
                                  key={c.id}
                                  className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs ${
                                    c.finalized_at
                                      ? 'bg-ok text-white'
                                      : 'border border-line-2 bg-surface text-ink-2'
                                  }`}
                                >
                                  <span className="font-bold">{roleLabel[c.role] ?? c.role}</span>
                                  {c.full_name && <span>{c.full_name}</span>}
                                  <span>
                                    {c.finalized_at
                                      ? ' ✓'
                                      : ` · ${te.filter((e) => e.counter_role === c.role).length} items`}
                                  </span>
                                </span>
                              ))}
                            </div>
                            <Button variant="danger" size="sm" className="flex-shrink-0" onClick={() => handleClearCounts(team.id)} disabled={clearingTeamId === team.id}>
                              {clearingTeamId === team.id ? '...' : 'Clear Counts'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <th rowSpan={2} className={TH_BASE + ' min-w-[100px]'}>Category</th>
                        <th rowSpan={2} className={TH_BASE + ' min-w-[100px]'}>Category 1</th>
                        <th rowSpan={2} className={TH_BASE + ' min-w-[80px]'}>Brand Code</th>
                        <th rowSpan={2} className={TH_BASE + ' min-w-[140px]'}>Brand Name</th>
                        <th rowSpan={2} className={TH_BASE + ' text-center'}>BPU</th>
                        <th colSpan={2} className={TH_GROUP}>{cName(team.id, 'independente', 'Independent')}</th>
                        <th colSpan={2} className={TH_GROUP}>{cName(team.id, 'contador_1', 'Count 1')}</th>
                        <th colSpan={2} className={TH_GROUP}>{cName(team.id, 'contador_2', 'Count 2')}</th>
                        <th rowSpan={2} className="w-8 bg-ink" />
                      </tr>
                      <tr>
                        <th className={TH_SUB}>Cases</th>
                        <th className={TH_SUB}>Units</th>
                        <th className={TH_SUB}>Cases</th>
                        <th className={TH_SUB}>Units</th>
                        <th className={TH_SUB}>Cases</th>
                        <th className={TH_SUB}>Units</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ground-2">
                      {liveCodes.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="px-4 py-12 text-center text-[15px] text-ink-2">
                            Waiting for first counts...
                          </td>
                        </tr>
                      ) : (
                        liveCodes.map((code) => {
                          const bpu = invMap[code]?.bpu ?? 1
                          const inv = invMap[code]
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
                                  ? 'cs-flash'
                                  : rStatus === 'combinado' || rStatus === 'resolvido'
                                    ? 'bg-ok/10'
                                    : rStatus === 'discrepancia'
                                      ? 'bg-diff/10'
                                      : 'hover:bg-ground'
                              }`}
                            >
                              <td className="px-3 py-2 text-xs text-ink-2">{inv?.category ?? '—'}</td>
                              <td className="px-3 py-2 text-xs text-ink-2">{inv?.category1 ?? '—'}</td>
                              <td className="px-3 py-2 font-mono text-xs font-semibold">{code}</td>
                              <td className="px-3 py-2 text-sm">{inv?.brand_name ?? '—'}</td>
                              <td className="px-3 py-2 text-center text-xs font-semibold text-ink-2">{inv?.bpu ?? '—'}</td>
                              <td className={TD}>{val(ind?.cases ?? null)}</td>
                              <td className={TD}>{val(ind?.units ?? null)}</td>
                              <td className={TD}>{val(c1?.cases ?? null)}</td>
                              <td className={TD}>{val(c1?.units ?? null)}</td>
                              <td className={TD}>{val(c2?.cases ?? null)}</td>
                              <td className={TD}>{val(c2?.units ?? null)}</td>
                              <td className="px-3 py-2.5 text-center text-base">
                                {rStatus === 'combinado' && <span className="text-ok">✓</span>}
                                {rStatus === 'resolvido' && <span className="text-ok text-xs font-bold">OK</span>}
                                {rStatus === 'discrepancia' && <span className="text-diff">⚠</span>}
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

          {/* ── Merged tab ───────────────────────────── */}
          <div style={{ display: activeTab === 'combinado' ? 'block' : 'none' }}>
            <table className="text-sm border-collapse w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th rowSpan={3} className={TH_BASE + ' min-w-[100px]'}>Category</th>
                  <th rowSpan={3} className={TH_BASE + ' min-w-[100px]'}>Category 1</th>
                  <th rowSpan={3} className={TH_BASE + ' min-w-[80px]'}>Brand Code</th>
                  <th rowSpan={3} className={TH_BASE + ' min-w-[140px]'}>Brand Name</th>
                  <th rowSpan={3} className={TH_BASE + ' text-center'}>BPU</th>
                  {reconcilidaTeams.map((team, i) => (
                    <th
                      key={team.id}
                      colSpan={8}
                      className={`px-3 py-2 border-l-2 border-ink text-center font-display text-[13px] font-bold uppercase tracking-[0.08em] whitespace-nowrap ${
                        i % 2 === 0 ? 'bg-ink-2 text-white' : 'bg-accent text-white'
                      }`}
                    >
                      {team.team_name}
                    </th>
                  ))}
                  <th
                    colSpan={2}
                    rowSpan={2}
                    className="px-3 py-2 bg-ok text-white border-l-2 border-ink text-center font-display text-[13px] font-bold uppercase tracking-[0.08em] align-middle whitespace-nowrap"
                  >
                    Merged Count
                  </th>
                </tr>
                <tr>
                  {reconcilidaTeams.map((team) => (
                    <Fragment key={team.id}>
                      <th colSpan={2} className={TH_GROUP}>{cName(team.id, 'independente', 'Independent')}</th>
                      <th colSpan={2} className={TH_GROUP}>{cName(team.id, 'contador_1', 'Count 1')}</th>
                      <th colSpan={2} className={TH_GROUP}>{cName(team.id, 'contador_2', 'Count 2')}</th>
                      <th colSpan={2} className={TH_GROUP}>Reconciliation*</th>
                    </Fragment>
                  ))}
                </tr>
                <tr>
                  {reconcilidaTeams.map((team) => (
                    <Fragment key={team.id}>
                      <th className={`${TH_SUB} border-l-2 border-ink`}>Cases</th>
                      <th className={TH_SUB}>Units</th>
                      <th className={TH_SUB}>Cases</th>
                      <th className={TH_SUB}>Units</th>
                      <th className={TH_SUB}>Cases</th>
                      <th className={TH_SUB}>Units</th>
                      <th className={TH_SUB}>Cases</th>
                      <th className={TH_SUB}>Units</th>
                    </Fragment>
                  ))}
                  <th className={TH_SUB}>Cases</th>
                  <th className={TH_SUB}>Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ground-2">
                {reconcCodes.map((code) => {
                  const inv = invMap[code]
                  const merged = getMerged(code)
                  return (
                    <tr key={code} className="hover:bg-ground">
                      <td className="px-3 py-2 text-xs text-ink-2 whitespace-nowrap">{inv?.category ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-ink-2 whitespace-nowrap">{inv?.category1 ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold whitespace-nowrap">{code}</td>
                      <td className="px-3 py-2 text-sm whitespace-nowrap">{inv?.brand_name ?? '—'}</td>
                      <td className="px-3 py-2 text-center text-xs font-semibold text-ink-2">{inv?.bpu ?? '—'}</td>
                      {reconcilidaTeams.map((team) => {
                        const ri = reconcMap[team.id]?.[code]
                        const isResolvido = ri?.status === 'resolvido'
                        return (
                          <Fragment key={team.id}>
                            <td className={`${TD} border-l-2 border-ground-2`}>
                              {ri ? val(ri.independente_cases) : <span className="text-ink-3">—</span>}
                            </td>
                            <td className={TD}>
                              {ri ? val(ri.independente_units) : <span className="text-ink-3">—</span>}
                            </td>
                            <td className={TD}>
                              {ri ? val(ri.contador_1_cases) : <span className="text-ink-3">—</span>}
                            </td>
                            <td className={TD}>
                              {ri ? val(ri.contador_1_units) : <span className="text-ink-3">—</span>}
                            </td>
                            <td className={TD}>
                              {ri ? val(ri.contador_2_cases) : <span className="text-ink-3">—</span>}
                            </td>
                            <td className={TD}>
                              {ri ? val(ri.contador_2_units) : <span className="text-ink-3">—</span>}
                            </td>
                            <td className={`${TD} ${ri && isResolvido ? 'text-info font-bold' : 'text-ink-3'}`}>
                              {ri ? (isResolvido ? val(ri.reconciliated_cases) : '—') : <span className="text-ink-3">—</span>}
                            </td>
                            <td className={`${TD} ${ri && isResolvido ? 'text-info font-bold' : 'text-ink-3'}`}>
                              {ri ? (isResolvido ? val(ri.reconciliated_units) : '—') : <span className="text-ink-3">—</span>}
                            </td>
                          </Fragment>
                        )
                      })}
                      <td className={`${TD} bg-ok/10 border-l-2 border-line text-ok font-bold`}>
                        {merged.cases}
                      </td>
                      <td className={`${TD} bg-ok/10 text-ok font-bold`}>
                        {merged.units}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Confirm + export bar */}
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                {confirmed ? (
                  <span className="text-[15px] font-semibold text-ok">✓ Merge confirmed and saved</span>
                ) : (
                  <>
                    <span className="text-[15px] text-ink-2">
                      {reconcilidaTeams.length} team{reconcilidaTeams.length !== 1 ? 's' : ''} reconciled. Confirm to save.
                    </span>
                    <Button variant="primary" onClick={handleConfirmar} disabled={isPending || !allReconciliada}>
                      {isPending ? 'Saving...' : 'Confirm Merge →'}
                    </Button>
                  </>
                )}
              </div>
              <a href={`/api/sessao/${sessionId}/export`} className={buttonClass('outline', 'md') + ' no-underline'}>Export Excel</a>
            </div>
            {erro && <div className="px-4 pb-3"><Notice>{erro}</Notice></div>}
          </div>
        </div>
      </div>
    </>
  )
}
