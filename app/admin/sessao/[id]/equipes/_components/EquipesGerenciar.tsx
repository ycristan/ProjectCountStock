'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { renomearContador } from '@/actions/sessao'
import type { ContadorComCredencial } from '@/actions/sessao'
import Link from 'next/link'

const ROLE_LABEL: Record<string, string> = {
  contador_1: 'Counter 1',
  contador_2: 'Counter 2',
  independente: 'Independent',
}

export function EquipesGerenciar({
  sessaoId,
  contadores,
}: {
  sessaoId: string
  contadores: ContadorComCredencial[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const teamMap = new Map<string, ContadorComCredencial[]>()
  for (const c of contadores) {
    if (!teamMap.has(c.team_id)) teamMap.set(c.team_id, [])
    teamMap.get(c.team_id)!.push(c)
  }
  const teams = [...teamMap.values()].sort((a, b) =>
    a[0].team_name.localeCompare(b[0].team_name)
  )

  function startEdit(c: ContadorComCredencial) {
    setEditingId(c.auth_user_id)
    setEditName(c.full_name)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  function saveEdit(authUserId: string) {
    startTransition(async () => {
      const res = await renomearContador(authUserId, editName)
      if (res.error) { setError(res.error); return }
      setEditingId(null)
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-1"
          >
            ← Dashboard
          </Link>
          <h2 className="text-xl font-semibold text-slate-900">Manage Teams</h2>
          <p className="text-sm text-slate-500 mt-0.5">{contadores.length} counters · {teams.length} teams</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link
            href={`/admin/sessao/${sessaoId}/imprimir`}
            className="px-3 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm"
          >
            QR Cards
          </Link>
          <Link
            href={`/admin/sessao/${sessaoId}/progresso`}
            className="px-3 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 text-sm"
          >
            View Progress →
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="space-y-4">
        {teams.map((grupo) => {
          const first = grupo[0]
          return (
            <div key={first.team_id} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-100">
                <span className="font-semibold text-slate-900">{first.team_name}</span>
                <span className="font-mono text-blue-700 font-bold text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-1">
                  Team Code: {first.team_pin}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-100">
                    <th className="px-4 py-2 text-left font-medium">Role</th>
                    <th className="px-4 py-2 text-left font-medium">Name</th>
                    <th className="px-4 py-2 text-left font-medium">Personal PIN</th>
                    <th className="px-4 py-2 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {grupo
                    .sort((a, b) => a.role.localeCompare(b.role))
                    .map((c) => (
                      <tr key={c.auth_user_id} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">{ROLE_LABEL[c.role] ?? c.role}</td>
                        <td className="px-4 py-3">
                          {editingId === c.auth_user_id ? (
                            <input
                              autoFocus
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit(c.auth_user_id)
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              className="px-2 py-1 border border-blue-400 rounded-lg text-sm w-full max-w-[200px] focus:outline-none"
                            />
                          ) : (
                            <span className="font-medium text-slate-900">{c.full_name || '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-700">{c.user_pin}</td>
                        <td className="px-4 py-3 print:hidden">
                          {editingId === c.auth_user_id ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveEdit(c.auth_user_id)}
                                disabled={isPending || !editName.trim()}
                                className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={isPending}
                                className="px-3 py-1 border border-slate-200 text-slate-600 rounded-lg text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(c)}
                              className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-2 py-1 hover:border-slate-400"
                            >
                              Rename
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-xs text-slate-400 print:hidden">
        Team Code is shared by all team members. PIN is individual per counter.
      </p>
    </div>
  )
}
