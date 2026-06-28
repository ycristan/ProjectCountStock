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

  const { data: { users: authUsers } = { users: [] } } = await admin.auth.admin.listUsers({
    perPage: 1000,
  })

  const nameMap: Record<string, string> = {}
  for (const u of authUsers) {
    const tid = u.user_metadata?.team_id
    const role = u.user_metadata?.counter_role
    const name = u.user_metadata?.full_name
    if (tid && role && name) nameMap[`${tid}:${role}`] = name
  }

  const counterNames = {
    contador_1: nameMap[`${teamId}:contador_1`] ?? 'C1',
    contador_2: nameMap[`${teamId}:contador_2`] ?? 'C2',
    independente: nameMap[`${teamId}:independente`] ?? 'Independente',
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
