import { redirect } from 'next/navigation'
import { getTeamCounterAccess } from '@/lib/authorization'
import { getFinalizacaoStatus } from '@/actions/finalizacao'
import { FinalizarClient } from './_components/FinalizarClient'

export default async function FinalizarPage() {
  const access = await getTeamCounterAccess()
  if (access?.counterRole === 'independente') redirect('/monitor')
  const { finalized_at } = await getFinalizacaoStatus()
  return <FinalizarClient jaFinalizado={!!finalized_at} finalizadoEm={finalized_at} />
}
