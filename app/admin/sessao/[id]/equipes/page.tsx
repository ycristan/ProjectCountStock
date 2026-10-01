import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { readTeamSetup } from '@/actions/team-setup'
import { TeamSetupForm } from './_components/TeamSetupForm'
import { listarEquipes } from '@/actions/sessao'
import { EquipesForm } from './_components/EquipesForm'
import { EquipesGerenciar } from './_components/EquipesGerenciar'

export default async function EquipesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ n?: string; flow?: string }>
}) {
  const { id } = await params
  const { n, flow } = await searchParams
  const numEquipes = Math.max(1, parseInt(n ?? '1'))

  if (flow === '2' && process.env.TEAM_SETUP_ENABLED === 'true') {
    const saved = await readTeamSetup(id)
    if (saved.error) return <p role="alert">{saved.error}</p>
    const db = await createClient()
    const { data: teams } = await db.from('teams').select('id,team_name,team_flows!inner(team_id)').eq('session_id', id)
    return <>
      <TeamSetupForm sessionId={id} numberOfTeams={Number.isFinite(numEquipes) ? numEquipes : 1}
        savedDraft={saved.draft} credentials={saved.credenciais} />
      <nav className="mt-4 flex flex-col gap-2" aria-label="Team counting monitors">
        {teams?.map(team => <Link key={team.id} href={'/team/' + team.id}>Open monitor — {team.team_name}</Link>)}
      </nav>
    </>
  }

  const contadores = await listarEquipes(id)

  if (contadores.length === 0) {
    return <EquipesForm sessaoId={id} numEquipes={numEquipes} />
  }

  return <EquipesGerenciar sessaoId={id} contadores={contadores} />
}
