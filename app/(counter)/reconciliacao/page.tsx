import { redirect } from 'next/navigation'
import { getTeamCounterAccess } from '@/lib/authorization'
import { listarDiscrepancias } from '@/actions/reconciliacao'
import { ReconciliacaoCounterClient } from './_components/ReconciliacaoCounterClient'

export default async function ReconciliacaoCounterPage() {
  const access = await getTeamCounterAccess()
  if (!access) redirect('/login')
  const items = await listarDiscrepancias()
  return <ReconciliacaoCounterClient items={items} readOnly={access.counterRole !== 'independente'} />
}
