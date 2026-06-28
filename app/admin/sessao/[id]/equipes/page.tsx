'use client'

import { use, useState } from 'react'
import { criarEquipes } from '@/actions/sessao'
import type { EquipeInput, Credencial } from '@/actions/sessao'
import Link from 'next/link'

const ROLE_LABEL: Record<string, string> = {
  contador_1: 'Contador 1',
  contador_2: 'Contador 2',
  independente: 'Independente',
}

export default function EquipesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ n?: string }>
}) {
  const { id } = use(params)
  const { n } = use(searchParams)
  const numEquipes = Math.max(1, parseInt(n ?? '1'))

  const [credenciais, setCredenciais] = useState<Credencial[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fd = new FormData(e.currentTarget)

    const equipes: EquipeInput[] = Array.from({ length: numEquipes }, (_, i) => ({
      team_name: String(fd.get(`team_${i}_name`) ?? `Equipe ${i + 1}`),
      equipeNum: i + 1,
      pessoas: [
        { nome: String(fd.get(`team_${i}_c1`) ?? ''), role: 'contador_1' as const },
        { nome: String(fd.get(`team_${i}_c2`) ?? ''), role: 'contador_2' as const },
        { nome: String(fd.get(`team_${i}_ind`) ?? ''), role: 'independente' as const },
      ],
    }))

    const result = await criarEquipes(id, equipes)
    if (result.error) setError(result.error)
    else if (result.credenciais) setCredenciais(result.credenciais)
    setLoading(false)
  }

  if (credenciais) {
    return (
      <div>
        <div className="flex justify-between items-center mb-4 print:hidden">
          <h2 className="text-xl font-semibold text-slate-900">Logins gerados</h2>
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/sessao/${id}/progresso`}
              className="px-4 py-2 border border-slate-200 text-slate-700 bg-white rounded-xl hover:bg-slate-50"
            >
              Ver progresso →
            </Link>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800"
            >
              Imprimir
            </button>
          </div>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 px-3 py-2 text-left">Equipe</th>
              <th className="border border-slate-200 px-3 py-2 text-left">Cód. Equipe</th>
              <th className="border border-slate-200 px-3 py-2 text-left">Função</th>
              <th className="border border-slate-200 px-3 py-2 text-left">PIN pessoal</th>
            </tr>
          </thead>
          <tbody>
            {credenciais.map((c, i) => (
              <tr key={i} className="even:bg-slate-50">
                <td className="border border-slate-200 px-3 py-2">{c.team}</td>
                <td className="border border-slate-200 px-3 py-2 font-mono font-bold text-blue-700">
                  {c.team_pin}
                </td>
                <td className="border border-slate-200 px-3 py-2">
                  {ROLE_LABEL[c.role] ?? c.role}
                </td>
                <td className="border border-slate-200 px-3 py-2 font-mono font-bold">
                  {c.user_pin}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-slate-500 print:hidden">
          Cód. Equipe é compartilhado por todos da equipe. PIN pessoal é individual.
        </p>
      </div>
    )
  }

  return (
    <div>
      <Link href="/admin" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4">
        ← Dashboard
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Configurar Equipes</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        {Array.from({ length: numEquipes }, (_, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-4">
            <h3 className="font-medium text-slate-900 mb-3">Equipe {i + 1}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Nome da equipe</label>
                <input
                  name={`team_${i}_name`}
                  defaultValue={`Equipe ${i + 1}`}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(['c1', 'c2', 'ind'] as const).map((role, j) => (
                  <div key={role}>
                    <label className="block text-sm text-slate-600 mb-1">
                      {['Contador 1', 'Contador 2', 'Independente'][j]}
                    </label>
                    <input
                      name={`team_${i}_${role}`}
                      required
                      placeholder="Nome"
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
          {loading ? 'Criando equipes...' : 'Criar equipes e gerar logins'}
        </button>
      </form>
    </div>
  )
}
