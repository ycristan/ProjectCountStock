import { redirect } from 'next/navigation'
import { getTeamCounterAccess } from '@/lib/authorization'
import { carregarInventario } from '@/actions/contagem'
import { BuscaClient } from './_components/BuscaClient'

export default async function BuscaPage() {
  const access = await getTeamCounterAccess()
  if (!access) redirect('/login')
  if (access.counterRole === 'independente') redirect('/monitor')
  const items = await carregarInventario()
  return <BuscaClient items={items} />
}
