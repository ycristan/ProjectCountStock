'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { renomearContador, deletarEquipe } from '@/actions/sessao'
import type { ContadorComCredencial } from '@/actions/sessao'
import Link from 'next/link'
import { Button, Notice, PageTop, buttonClass, cardClass, inputClass, thClass } from '@/components/ui'

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
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null)
  const [isDeletingTeam, setIsDeletingTeam] = useState(false)

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

  async function handleDeleteTeam(teamId: string) {
    setIsDeletingTeam(true)
    setError(null)
    const res = await deletarEquipe(teamId)
    setIsDeletingTeam(false)
    if (res.error) { setError(res.error); return }
    setDeletingTeamId(null)
    router.refresh()
  }

  return (
    <div>
      <div className="print:hidden">
        <PageTop back={{ href: '/admin', label: 'Home' }} kicker={`${contadores.length} counters · ${teams.length} teams`} title="Manage Teams" actions={<>
          <Link href={`/admin/sessao/${sessaoId}/imprimir`} className={buttonClass('outline', 'sm') + ' no-underline'}>QR Cards</Link>
          <Link href={`/admin/sessao/${sessaoId}/combinacao`} className={buttonClass('primary', 'sm') + ' no-underline'}>Live Count →</Link>
        </>} />
      </div>

      {error && <div className="mb-4"><Notice>{error}</Notice></div>}

      <div className="flex flex-col gap-4">
        {teams.map((grupo) => {
          const first = grupo[0]
          return (
            <div key={first.team_id} className={cardClass + ' overflow-hidden'}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <strong className="font-display text-2xl font-bold uppercase">{first.team_name}</strong>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm border-[1.5px] border-ink bg-line px-2 py-1 font-mono text-sm font-semibold">
                    Team Code: {first.team_pin}
                  </span>
                  {deletingTeamId === first.team_id ? (
                    <>
                      <span className="text-[13px] text-ink-2">Delete team?</span>
                      <Button variant="alert" size="sm" onClick={() => handleDeleteTeam(first.team_id)} disabled={isDeletingTeam}>
                        {isDeletingTeam ? '...' : 'Confirm'}
                      </Button>
                      <Button variant="quiet" size="sm" onClick={() => setDeletingTeamId(null)} disabled={isDeletingTeam}>Cancel</Button>
                    </>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => setDeletingTeamId(first.team_id)}>Delete</Button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="bg-ink text-ground">
                      <th className={thClass}>Role</th>
                      <th className={thClass}>Name</th>
                      <th className={thClass}>Personal PIN</th>
                      <th className={thClass + ' print:hidden'} />
                    </tr>
                  </thead>
                  <tbody>
                    {grupo
                      .sort((a, b) => a.role.localeCompare(b.role))
                      .map((c) => (
                        <tr key={c.auth_user_id} className="border-t border-ground-2">
                          <td className="px-3 py-2.5 text-ink-2">{ROLE_LABEL[c.role] ?? c.role}</td>
                          <td className="px-3 py-2.5">
                            {editingId === c.auth_user_id ? (
                              <input
                                autoFocus
                                aria-label="Name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit(c.auth_user_id)
                                  if (e.key === 'Escape') cancelEdit()
                                }}
                                className={inputClass + ' max-w-[220px]'}
                              />
                            ) : (
                              <span className="font-semibold">{c.full_name || '—'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-base font-semibold">{c.user_pin}</td>
                          <td className="px-3 py-2.5 print:hidden">
                            {editingId === c.auth_user_id ? (
                              <div className="flex gap-2">
                                <Button variant="dark" size="sm" onClick={() => saveEdit(c.auth_user_id)} disabled={isPending || !editName.trim()}>Save</Button>
                                <Button variant="quiet" size="sm" onClick={cancelEdit} disabled={isPending}>Cancel</Button>
                              </div>
                            ) : (
                              <Button variant="quiet" size="sm" onClick={() => startEdit(c)}>Rename</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-[13px] text-ink-2 print:hidden">
        Team Code is shared by all team members. PIN is individual per counter.
      </p>
    </div>
  )
}
