import { createClient } from '@/lib/supabase-server'
import { sessionHref } from '@/lib/session-href'
import { SessoesClient } from './_components/SessoesClient'

export default async function SessoesPage() {
  const supabase = await createClient()

  const { data: sessoes } = await supabase
    .from('count_sessions')
    .select('id, created_at, status, teams(team_flows(team_id))')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Count Sessions</h2>
      <SessoesClient sessoes={(sessoes ?? []).map(({ teams, ...s }) => ({ ...s, href: sessionHref(s.id, teams) }))} />
    </div>
  )
}
