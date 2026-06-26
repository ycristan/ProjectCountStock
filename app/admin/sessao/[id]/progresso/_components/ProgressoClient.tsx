'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Counter = {
  id: string
  role: string
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

export function ProgressoClient({ sessionCreatedAt, sessionStatus, teams }: Props) {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(interval)
  }, [router])

  const totalCounters = teams.reduce((sum, t) => sum + t.counters.length, 0)
  const finalizedCounters = teams.reduce(
    (sum, t) => sum + t.counters.filter((c) => c.finalized_at).length,
    0
  )

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
          const allFinalized = team.counters.length > 0 && team.counters.every((c) => c.finalized_at)
          return (
            <div key={team.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div
                className={`px-4 py-3 flex items-center justify-between border-b ${
                  allFinalized
                    ? 'bg-green-50 border-green-100'
                    : 'bg-gray-50 border-gray-100'
                }`}
              >
                <span className="font-semibold text-gray-900">{team.team_name}</span>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    allFinalized
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {allFinalized ? '✓ Finalizado' : 'Em contagem'}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {team.counters.map((c) => (
                  <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                        {roleLabel[c.role] ?? c.role}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {c.role.replace('_', ' ')}
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
