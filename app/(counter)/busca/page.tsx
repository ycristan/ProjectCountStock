import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { carregarInventario } from '@/actions/contagem'
import { BuscaClient } from './_components/BuscaClient'

export default async function BuscaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user?.user_metadata?.counter_role === 'independente') {
    redirect('/monitor')
  }

  const items = await carregarInventario()
  return <BuscaClient items={items} />
}
