import { createClient } from '@/lib/supabase-server'
import { SessoesClient } from './_components/SessoesClient'

export default async function SessoesPage() {
  const supabase = await createClient()

  const { data: sessoes } = await supabase
    .from('count_sessions')
    .select('id, created_at, status, teams(team_flows(team_id))')
    .order('created_at', { ascending: false })
  const newFlow = process.env.TEAM_SETUP_ENABLED === 'true'

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Count Sessions</h2>
      <SessoesClient sessoes={(sessoes ?? []).map(({ teams, ...s }) => ({
        ...s,
        // Same rule as the teams page: no legacy team means the new flow.
        href: newFlow && teams.every(t => t.team_flows)
          ? `/admin/sessao/${s.id}/equipes` : `/admin/sessao/${s.id}/combinacao`,
      }))} />
    </div>
  )
}
