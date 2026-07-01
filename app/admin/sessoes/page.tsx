import { createClient } from '@/lib/supabase-server'
import { SessoesClient } from './_components/SessoesClient'

export default async function SessoesPage() {
  const supabase = await createClient()

  const { data: sessoes } = await supabase
    .from('count_sessions')
    .select('id, created_at, status')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Count Sessions</h2>
      <SessoesClient sessoes={sessoes ?? []} />
    </div>
  )
}
