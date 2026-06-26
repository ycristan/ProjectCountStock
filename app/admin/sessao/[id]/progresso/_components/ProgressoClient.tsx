'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { finalizarEquipe } from '@/actions/reconciliacao'

type Counter = {
  id: string
  role: string
  full_name: string | null
  finalized_at: string | null
  entry_count: number
}

type TeamData = {
  id: string
  team_name: string
  status: string
  counters: Counter[]
}

type Props = {
  sessionId: string
  sessionStatus: string
  sessionCreatedAt: string
  teams: TeamData[]
}

const roleLabel: Record<string, string> = {
  contador_1: 'C1',
  contador_2: 'C2',
  independente: 'Ind',
}

export function ProgressoClient({ sessionId, sessionCreatedAt, sessionStatus, teams }: Props) {
  const router = useRouter()
  const [loadingTeam, setLoadingTeam] = useState<string | null>(null)

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(interval)
  }, [router])

  const totalCounters = teams.reduce((sum, t) => sum + t.counters.length, 0)
  const finalizedCounters = teams.reduce(
    (sum, t) => sum + t.counters.filter((c) => c.finalized_at).length,
    0
  )

  async function handleFinalizarEquipe(teamId: string) {
    setLoadingTeam(teamId)
    await finalizarEquipe(teamId)
    router.refresh()
    setLoadingTeam(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Progresso da Contagem</h2>
          <div className="text-sm text-gray-500 mt-0.5">
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
        <button
          onClick={() => router.refresh()}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Atualizar
        </button>
      </div>

      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        {finalizedCounters}/{totalCounters} contadores finalizaram · Atualiza a cada 30s
      </div>

      <div className="space-y-4">
        {teams.map((team) => {
          const allFinalized =
            team.counters.length > 0 && team.counters.every((c) => c.finalized_at)
          const isReconciliando = team.status === 'reconciliando'
          const isReconciliada = team.status === 'reconciliada'
          const isLoading = loadingTeam === team.id

          const borderClass = isReconciliada
            ? 'border-green-400'
            : isReconciliando
            ? 'border-amber-400'
            : 'border-gray-200'

          const headerBg = isReconciliada
            ? 'bg-green-50 border-green-100'
            : isReconciliando
            ? 'bg-amber-50 border-amber-100'
            : allFinalized
            ? 'bg-green-50 border-green-100'
            : 'bg-gray-50 border-gray-100'

          return (
            <div
              key={team.id}
              className={`bg-white border rounded-lg overflow-hidden ${borderClass}`}
            >
              <div
                className={`px-4 py-3 flex items-center justify-between border-b ${headerBg}`}
              >
                <span className="font-semibold text-gray-900">{team.team_name}</span>
                <div className="flex items-center gap-3">
                  {isReconciliada && (
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
                      ✓ Reconciliada
                    </span>
                  )}
                  {isReconciliando && (
                    <>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                        Reconciliando
                      </span>
                      <Link
                        href={`/admin/sessao/${sessionId}/reconciliacao/${team.id}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Ver reconciliação →
                      </Link>
                    </>
                  )}
                  {!isReconciliando && !isReconciliada && (
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        allFinalized
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {allFinalized ? '✓ Todos finalizaram' : 'Em contagem'}
                    </span>
                  )}
                  {allFinalized && team.status === 'contando' && (
                    <button
                      onClick={() => handleFinalizarEquipe(team.id)}
                      disabled={isLoading}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                    >
                      {isLoading ? 'Aguarde...' : 'Finalizar Equipe →'}
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {team.counters.map((c) => (
                  <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          c.role === 'independente'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {roleLabel[c.role] ?? c.role}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {c.full_name ?? c.role.replace(/_/g, ' ')}
                        </div>
                        <div className="text-xs text-gray-500">{c.entry_count} itens lançados</div>
                      </div>
                    </div>
                    {c.finalized_at ? (
                      <div className="text-right">
                        <div className="text-xs font-semibold text-green-600">✓ Finalizado</div>
                        <div className="text-xs text-gray-400">
                          {new Date(c.finalized_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Em contagem...</span>
                    )}
                  </div>
                ))}
                {team.counters.length === 0 && (
                  <div className="px-4 py-3 text-xs text-gray-400">Nenhum contador criado.</div>
                )}
              </div>
            </div>
          )
        })}
        {teams.length === 0 && (
          <p className="text-sm text-gray-500">Nenhuma equipe criada nesta sessão.</p>
        )}
      </div>
    </div>
  )
}
