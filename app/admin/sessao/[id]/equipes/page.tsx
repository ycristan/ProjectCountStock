import { listarEquipes } from '@/actions/sessao'
import { EquipesForm } from './_components/EquipesForm'
import { EquipesGerenciar } from './_components/EquipesGerenciar'

export default async function EquipesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ n?: string }>
}) {
  const { id } = await params
  const { n } = await searchParams
  const numEquipes = Math.max(1, parseInt(n ?? '1'))

  const contadores = await listarEquipes(id)

  if (contadores.length === 0) {
    return <EquipesForm sessaoId={id} numEquipes={numEquipes} />
  }

  return <EquipesGerenciar sessaoId={id} contadores={contadores} />
}
