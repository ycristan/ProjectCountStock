'use client'

import { useState } from 'react'
import { criarEquipes } from '@/actions/sessao'
import type { EquipeInput, Credencial } from '@/actions/sessao'
import { Button, Label, Notice, PageTop, cardClass, inputClass } from '@/components/ui'
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
      <PageTop back={{ href: '/admin', label: 'Home' }} title="Configure Teams" />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {Array.from({ length: numEquipes }, (_, i) => (
          <div key={i} className={cardClass + ' flex flex-col gap-3 p-4'}>
            <h3 className="m-0 font-display text-xl font-bold uppercase">Team {i + 1}</h3>
            <label className="flex flex-col gap-1.5">
              <Label>Team Name</Label>
              <input name={`team_${i}_name`} defaultValue={`Team ${i + 1}`} className={inputClass} />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['c1', 'c2', 'ind'] as const).map((role, j) => (
                <label key={role} className="flex flex-col gap-1.5">
                  <Label>{['Counter 1', 'Counter 2', 'Independent'][j]}</Label>
                  <input name={`team_${i}_${role}`} required placeholder="Name" className={inputClass} />
                </label>
              ))}
            </div>
          </div>
        ))}
        {error && <Notice>{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" full disabled={loading}>
          {loading ? 'Creating teams...' : 'Create Teams and Generate Logins'}
        </Button>
      </form>
    </div>
  )
}
