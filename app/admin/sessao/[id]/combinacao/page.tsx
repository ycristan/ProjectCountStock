import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { redirect } from 'next/navigation'
import { CombinacaoClient } from './_components/CombinacaoClient'

export default async function CombinacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (user?.user_metadata?.role !== 'admin') redirect('/login')

  const { data: teams } = await supabase
    .from('teams')
    .select('id, team_name')
    .eq('session_id', sessionId)
    .eq('status', 'reconciliada')
    .order('team_name')

  if (!teams?.length) redirect(`/admin/sessao/${sessionId}/progresso`)

  const teamIds = teams.map((t) => t.id)

  const [{ data: reconcItems }, { data: inventory }, { data: { users } }] = await Promise.all([
    supabase
      .from('reconciliation_items')
      .select(
        'team_id, brand_code, status, contador_1_cases, contador_1_units, contador_2_cases, contador_2_units, independente_cases, independente_units, reconciliated_cases, reconciliated_units'
      )
      .in('team_id', teamIds),
    (async () => {
      const brandCodes = (await supabase.from('reconciliation_items').select('brand_code').in('team_id', teamIds)).data?.map(r => r.brand_code) ?? []
      return brandCodes.length
        ? supabase.from('inventory_items').select('brand_code, brand_name, bpu, category, category1').in('brand_code', [...new Set(brandCodes)])
        : { data: [] }
    })(),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ])

  const counters: Record<string, Record<string, string>> = {}
  for (const u of users ?? []) {
    const tid = u.user_metadata?.team_id as string
    const role = u.user_metadata?.counter_role as string
    const name = u.user_metadata?.full_name as string
    if (tid && role && teamIds.includes(tid)) {
      if (!counters[tid]) counters[tid] = {}
      counters[tid][role] = name ?? ''
    }
  }

  const { data: existing } = await supabase
    .from('combined_results')
    .select('brand_code')
    .eq('session_id', sessionId)
    .limit(1)

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      <CombinacaoClient
        sessionId={sessionId}
        teams={teams}
        reconcItems={reconcItems ?? []}
        inventory={inventory ?? []}
        isConfirmed={(existing?.length ?? 0) > 0}
        counters={counters}
      />
    </div>
  )
}
