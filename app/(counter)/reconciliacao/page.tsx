import { redirect } from 'next/navigation'
import { getTeamCounterAccess } from '@/lib/authorization'
import { listarDiscrepancias } from '@/actions/reconciliacao'
import { ReconciliacaoCounterClient } from './_components/ReconciliacaoCounterClient'

export default async function ReconciliacaoCounterPage() {
  const access = await getTeamCounterAccess()
  if (!access) redirect('/busca')

  const items = await listarDiscrepancias()
  return <ReconciliacaoCounterClient items={items} teamId={access.teamId} readOnly={access.counterRole !== 'independente'} />
}
