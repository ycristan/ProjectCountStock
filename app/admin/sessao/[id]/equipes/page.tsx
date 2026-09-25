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
    return <TeamSetupForm sessionId={id} numberOfTeams={Number.isFinite(numEquipes) ? numEquipes : 1}
      savedDraft={saved.draft} credentials={saved.credenciais} />
  }

  const contadores = await listarEquipes(id)

  if (contadores.length === 0) {
    return <EquipesForm sessaoId={id} numEquipes={numEquipes} />
  }

  return <EquipesGerenciar sessaoId={id} contadores={contadores} />
}
