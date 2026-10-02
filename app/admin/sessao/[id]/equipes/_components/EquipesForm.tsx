'use client'

import { useState } from 'react'
import { criarEquipes } from '@/actions/sessao'
import type { EquipeInput, Credencial } from '@/actions/sessao'
import Link from 'next/link'
import { LoginCards } from './LoginCards'

export function EquipesForm({
  sessaoId,
  numEquipes,
}: {
  sessaoId: string
  numEquipes: number
}) {
  const [credenciais, setCredenciais] = useState<Credencial[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const equipes: EquipeInput[] = Array.from({ length: numEquipes }, (_, i) => ({
      team_name: String(fd.get(`team_${i}_name`) ?? `Team ${i + 1}`),
      equipeNum: i + 1,
      pessoas: [
        { nome: String(fd.get(`team_${i}_c1`) ?? ''), role: 'contador_1' as const },
        { nome: String(fd.get(`team_${i}_c2`) ?? ''), role: 'contador_2' as const },
        { nome: String(fd.get(`team_${i}_ind`) ?? ''), role: 'independente' as const },
      ],
    }))
    const result = await criarEquipes(sessaoId, equipes)
    if (result.error) setError(result.error)
    else if (result.credenciais) setCredenciais(result.credenciais)
    setLoading(false)
  }

  if (credenciais) return <LoginCards credentials={credenciais} sessionId={sessaoId} />

  return (
    <div>
      <Link
        href="/admin"
        className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        ← Dashboard
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Configure Teams</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        {Array.from({ length: numEquipes }, (_, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-4">
            <h3 className="font-medium text-slate-900 mb-3">Team {i + 1}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Team Name</label>
                <input
                  name={`team_${i}_name`}
                  defaultValue={`Team ${i + 1}`}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(['c1', 'c2', 'ind'] as const).map((role, j) => (
                  <div key={role}>
                    <label className="block text-sm text-slate-600 mb-1">
                      {['Counter 1', 'Counter 2', 'Independent'][j]}
                    </label>
                    <input
                      name={`team_${i}_${role}`}
                      required
                      placeholder="Name"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Creating teams...' : 'Create Teams and Generate Logins'}
        </button>
      </form>
    </div>
  )
}
