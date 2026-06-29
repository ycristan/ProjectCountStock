'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { finalizarEquipe } from '@/actions/reconciliacao'

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
  bin_location: string | null
  status: string
  reconciliated_cases: number | null
  reconciliated_units: number | null
  independente_cases: number | null
  independente_units: number | null
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

type Props = {
  sessionId: string
  sessionStatus: string
  sessionCreatedAt: string
  teams: Team[]
  initialEntries: EntryRow[]
  initialReconc: ReconcRow[]
  invMap: Record<string, { brand_name: string; bpu: number }>
}

const roleLabel: Record<string, string> = { contador_1: 'C1', contador_2: 'C2', independente: 'Ind' }

// ponytail: 10+21 is the company standard — no cx/un labels
function fmtVal(v: { cases: number; units: number } | null) {
  return v ? `${v.cases}+${v.units}` : '—'
}

function sumRole(
  rows: EntryRow[],
  code: string,
  role: string,
  bpu: number,
): { cases: number; units: number } | null {
  const r = rows.filter((e) => e.brand_code === code && e.counter_role === role)
  if (!r.length) return null
  const t = r.reduce((s, e) => s + e.final_cases * bpu + e.final_units, 0)
  return { cases: Math.floor(t / bpu), units: t % bpu }
}

export function ProgressoClient({
  sessionId,
  sessionCreatedAt,
  sessionStatus,
  teams: init,
  initialEntries,
  initialReconc,
  invMap,
}: Props) {
  const [teams, setTeams] = useState(init)
  const [entries, setEntries] = useState(initialEntries)
  const [reconc, setReconc] = useState(initialReconc)
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set())
  const [loadingTeam, setLoadingTeam] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const tids = new Set(init.map((t) => t.id))
    let mounted = true
    let channel: ReturnType<typeof supabase.channel>

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)

      channel = supabase
        .channel(`progresso-${sessionId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'count_entries' }, ({ new: row }) => {
          const r = row as EntryRow
          if (!tids.has(r.team_id)) return
          setEntries((p) => [
            ...p.filter(
              (e) => !(e.team_id === r.team_id && e.counter_role === r.counter_role && e.brand_code === r.brand_code),
            ),
            r,
          ])
          const k = `${r.team_id}:${r.brand_code}`
          setNewKeys((p) => new Set([...p, k]))
          setTimeout(
            () => setNewKeys((p) => { const n = new Set(p); n.delete(k); return n }),
            1500,
          )
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reconciliation_items' },
          ({ new: row }) => {
            const r = row as ReconcRow
            if (!tids.has(r.team_id)) return
            // ponytail: bin_location no longer meaningful; dedup by team+brand only
            setReconc((p) => [
              ...p.filter((x) => !(x.team_id === r.team_id && x.brand_code === r.brand_code)),
              r,
            ])
          },
        )
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, ({ new: row }) => {
          const r = row as { id: string; status: string }
          if (!tids.has(r.id)) return
          setTeams((p) => p.map((t) => (t.id === r.id ? { ...t, status: r.status } : t)))
        })
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'counter_accounts' },
          ({ new: row }) => {
            const r = row as { id: string; finalized_at: string | null }
            setTeams((p) =>
              p.map((t) => ({
                ...t,
                counters: t.counters.map((c) => (c.id === r.id ? { ...c, finalized_at: r.finalized_at } : c)),
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

  async function handleFinalizarEquipe(teamId: string) {
    setLoadingTeam(teamId)
    await finalizarEquipe(teamId)
    setLoadingTeam(null)
  }

  const totalCounters = teams.reduce((s, t) => s + t.counters.length, 0)
  const finalizedCounters = teams.reduce((s, t) => s + t.counters.filter((c) => c.finalized_at).length, 0)
  const allReconciliada = teams.length > 0 && teams.every((t) => t.status === 'reconciliada')

  const mergedMap: Record<string, { brand_name: string; bpu: number; totalUnits: number; teamCount: number }> = {}
  for (const team of teams.filter((t) => t.status === 'reconciliada')) {
    const tr = reconc.filter((r) => r.team_id === team.id)
    for (const code of [...new Set(tr.map((r) => r.brand_code))]) {
      const bpu = invMap[code]?.bpu ?? 1
      const total = tr
        .filter((r) => r.brand_code === code)
        .reduce((s, r) => {
          const c = r.status === 'resolvido' ? (r.reconciliated_cases ?? 0) : (r.independente_cases ?? 0)
          const u = r.status === 'resolvido' ? (r.reconciliated_units ?? 0) : (r.independente_units ?? 0)
          return s + c * bpu + u
        }, 0)
      if (!mergedMap[code])
        mergedMap[code] = { brand_name: invMap[code]?.brand_name ?? code, bpu, totalUnits: 0, teamCount: 0 }
      mergedMap[code].totalUnits += total
      mergedMap[code].teamCount += 1
    }
  }
  const mergedItems = Object.entries(mergedMap)
    .map(([code, v]) => ({
      brand_code: code,
      ...v,
      merged_cases: Math.floor(v.totalUnits / v.bpu),
      merged_units: v.totalUnits % v.bpu,
    }))
    .sort((a, b) => a.brand_code.localeCompare(b.brand_code))

  return (
    <div>
      <style>{`
        @keyframes rowFlash { from { background-color: rgb(219 234 254); } to { background-color: transparent; } }
        .row-flash { animation: rowFlash 1.5s ease-out forwards; }
      `}</style>

      <Link href="/admin" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4">
        ← Dashboard
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Contagem ao vivo</h2>
          <div className="text-sm text-slate-500 mt-0.5">
            {sessionCreatedAt
              ? new Date(sessionCreatedAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })
              : '—'}
            {' · '}Status: {sessionStatus}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allReconciliada && (
            <Link
              href={`/admin/sessao/${sessionId}/combinacao`}
              className="text-sm font-semibold text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 rounded-xl px-3 py-1.5"
            >
              Ver combinação →
            </Link>
          )}
          <Link
            href={`/admin/sessao/${sessionId}/equipes`}
            className="text-sm text-slate-600 hover:text-slate-900 font-medium border border-slate-200 rounded-xl px-3 py-1.5 hover:border-slate-400"
          >
            Gerenciar equipes
          </Link>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block" />
        Ao vivo · {finalizedCounters}/{totalCounters} contadores finalizaram
      </div>

      <div className="space-y-6 mb-8">
        {teams.map((team) => {
          const allFinalized = team.counters.length > 0 && team.counters.every((c) => c.finalized_at)
          const isReconciliando = team.status === 'reconciliando'
          const isReconciliada = team.status === 'reconciliada'
          const isLoading = loadingTeam === team.id
          const te = entries.filter((e) => e.team_id === team.id)
          const codes = [...new Set(te.map((e) => e.brand_code))].sort()

          return (
            <div
              key={team.id}
              className={`bg-white border rounded-xl overflow-hidden shadow-sm ${
                isReconciliada ? 'border-green-400'
                : isReconciliando ? 'border-amber-400'
                : 'border-slate-200'
              }`}
            >
              {/* Team header */}
              <div
                className={`px-4 py-3 flex items-center justify-between ${
                  isReconciliada ? 'bg-green-50 border-b border-green-200'
                  : isReconciliando ? 'bg-amber-50 border-b border-amber-200'
                  : allFinalized ? 'bg-blue-50 border-b border-blue-100'
                  : 'bg-slate-50 border-b border-slate-200'
                }`}
              >
                <span className="font-semibold text-slate-900">{team.team_name}</span>
                <div className="flex items-center gap-3">
                  {isReconciliada && (
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
                      ✓ Reconciliada
                    </span>
                  )}
                  {isReconciliando && (
                    <>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                        Aguardando independente
                      </span>
                      <Link
                        href={`/admin/sessao/${sessionId}/reconciliacao/${team.id}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Acompanhar →
                      </Link>
                    </>
                  )}
                  {!isReconciliando && !isReconciliada &&
                    (allFinalized ? (
                      <button
                        onClick={() => handleFinalizarEquipe(team.id)}
                        disabled={isLoading}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                      >
                        {isLoading ? 'Aguarde...' : 'Checar discrepâncias →'}
                      </button>
                    ) : (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-200 text-slate-600">
                        Em contagem
                      </span>
                    ))}
                </div>
              </div>

              {/* Counter badges */}
              <div className="px-4 py-2.5 flex gap-2 flex-wrap border-b border-slate-100 bg-white">
                {team.counters.map((c) => (
                  <span
                    key={c.id}
                    className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ${
                      c.finalized_at ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <span className="font-bold">{roleLabel[c.role] ?? c.role}</span>
                    {c.full_name && <span>{c.full_name}</span>}
                    <span>
                      {c.finalized_at ? ' ✓' : ` · ${te.filter((e) => e.counter_role === c.role).length} itens`}
                    </span>
                  </span>
                ))}
              </div>

              {/* Items table */}
              {codes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b-2 border-slate-300">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide w-1/2">Item</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">C1</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">C2</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">Ind</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide w-14"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {codes.map((code) => {
                        const bpu = invMap[code]?.bpu ?? 1
                        const c1 = sumRole(te, code, 'contador_1', bpu)
                        const c2 = sumRole(te, code, 'contador_2', bpu)
                        const ind = sumRole(te, code, 'independente', bpu)
                        const rRows = reconc.filter((r) => r.team_id === team.id && r.brand_code === code)
                        const rStatus = rRows.length
                          ? rRows.some((r) => r.status === 'discrepancia') ? 'discrepancia'
                            : rRows.every((r) => r.status === 'combinado') ? 'combinado'
                            : 'resolvido'
                          : null
                        const isNew = newKeys.has(`${team.id}:${code}`)

                        return (
                          <tr
                            key={code}
                            className={`${
                              isNew ? 'row-flash'
                              : rStatus === 'combinado' || rStatus === 'resolvido' ? 'bg-green-50'
                              : rStatus === 'discrepancia' ? 'bg-amber-50'
                              : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-slate-800 text-xs">{code}</div>
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
                              {rStatus === 'combinado' && <span className="text-green-500">✓</span>}
                              {rStatus === 'resolvido' && <span className="text-green-500 text-xs font-bold">OK</span>}
                              {rStatus === 'discrepancia' && <span className="text-amber-500">⚠</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-4 py-5 text-xs text-slate-400 text-center">Aguardando primeiras contagens...</div>
              )}
            </div>
          )
        })}
        {teams.length === 0 && <p className="text-sm text-slate-500">Nenhuma equipe criada nesta sessão.</p>}
      </div>

      {mergedItems.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-slate-900 mb-3">Contagem consolidada</h3>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b-2 border-slate-300">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide w-1/2">Item</th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">Equipes</th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {mergedItems.map((item) => (
                  <tr key={item.brand_code} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-800 text-xs">{item.brand_code}</div>
                      <div className="text-xs text-slate-400">{item.brand_name}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-500">{item.teamCount}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-sm font-semibold text-slate-800">
                      {item.merged_cases}+{item.merged_units}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
