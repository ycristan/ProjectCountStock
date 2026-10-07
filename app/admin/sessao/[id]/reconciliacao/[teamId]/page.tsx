import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ReconciliacaoClient } from './_components/ReconciliacaoClient'

type ReconcItem = {
  id: string
  brand_code: string
  brand_name: string
  bin_location: string | null
  status: 'combinado' | 'discrepancia' | 'resolvido'
  contador_1_cases: number | null
  contador_1_units: number | null
  contador_2_cases: number | null
  contador_2_units: number | null
  independente_cases: number | null
  independente_units: number | null
  reconciliated_cases: number | null
  reconciliated_units: number | null
}

export default async function ReconciliacaoPage({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>
}) {
  const { id: sessionId, teamId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: team } = await supabase
    .from('teams')
    .select('id, team_name, status')
    .eq('id', teamId)
    .single()

  const { data: rawItems } = await admin
    .from('reconciliation_items')
    .select(
      'id, brand_code, bin_location, status, contador_1_cases, contador_1_units, contador_2_cases, contador_2_units, independente_cases, independente_units, reconciliated_cases, reconciliated_units',
    )
    .eq('team_id', teamId)
    .order('brand_code')

  const brandCodes = [...new Set((rawItems ?? []).map((i) => i.brand_code))]
  const { data: invItems } = await supabase
    .from('inventory_items')
    .select('brand_code, brand_name')
    .in('brand_code', brandCodes)

  const brandNameMap: Record<string, string> = {}
  for (const inv of invItems ?? []) {
    brandNameMap[inv.brand_code] = inv.brand_name
  }

  const [{ data: accounts }, { data: { users: authUsers } = { users: [] } }] = await Promise.all([
    admin.from('counter_accounts').select('auth_user_id, role').eq('team_id', teamId),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  // Papel e equipe vêm de counter_accounts (protegido); metadata só fornece o nome exibido.
  const userNames = new Map(authUsers.map((u) => [u.id, u.user_metadata?.full_name as string | undefined]))
  const nameMap: Record<string, string> = {}
  for (const a of accounts ?? []) {
    const name = a.auth_user_id ? userNames.get(a.auth_user_id) : undefined
    if (name) nameMap[a.role] = name
  }

  const counterNames = {
    contador_1: nameMap.contador_1 ?? 'C1',
    contador_2: nameMap.contador_2 ?? 'C2',
    independente: nameMap.independente ?? 'Independente',
  }

  const items: ReconcItem[] = (rawItems ?? []).map((i) => ({
    id: i.id,
    brand_code: i.brand_code,
    brand_name: brandNameMap[i.brand_code] ?? i.brand_code,
    bin_location: i.bin_location,
    status: i.status as 'combinado' | 'discrepancia' | 'resolvido',
    contador_1_cases: i.contador_1_cases,
    contador_1_units: i.contador_1_units,
    contador_2_cases: i.contador_2_cases,
    contador_2_units: i.contador_2_units,
    independente_cases: i.independente_cases,
    independente_units: i.independente_units,
    reconciliated_cases: i.reconciliated_cases,
    reconciliated_units: i.reconciliated_units,
  }))

  return (
    <ReconciliacaoClient
      sessionId={sessionId}
      teamId={teamId}
      teamName={team?.team_name ?? 'Equipe'}
      teamStatus={team?.status ?? 'reconciliando'}
      items={items}
      counterNames={counterNames}
    />
  )
}
