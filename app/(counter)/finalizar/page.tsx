import { getFinalizacaoStatus } from '@/actions/finalizacao'
import { FinalizarClient } from './_components/FinalizarClient'

export default async function FinalizarPage() {
  const { finalized_at } = await getFinalizacaoStatus()
  return <FinalizarClient jaFinalizado={!!finalized_at} finalizadoEm={finalized_at} />
}
