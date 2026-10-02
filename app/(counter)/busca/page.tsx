import { getTeamCounterAccess } from '@/lib/authorization'
import { carregarInventario } from '@/actions/contagem'
import { BuscaClient } from './_components/BuscaClient'

export default async function BuscaPage() {
  const access = await getTeamCounterAccess()
  if (!access) return <p>Team access unavailable. Please contact an administrator.</p>
  const items = await carregarInventario()
  return <BuscaClient items={items} readOnly={access.counterRole === 'independente'} />
}
