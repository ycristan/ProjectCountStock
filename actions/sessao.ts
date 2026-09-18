'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import { redirect } from 'next/navigation'
import { getDefaultTare } from '@/actions/settings'
import { getTeamCounterAccess, isAdmin } from '@/lib/authorization'

type UploadState = { error?: string; success?: boolean; count?: number; skipped?: number } | null
type SessaoState = { error?: string } | null

// Legacy endpoint cannot bypass review or warehouse scoping.
export async function uploadInventory(_prevState: UploadState, _formData: FormData): Promise<UploadState> {
  return { error: 'Use Inventory > Import inventory to review the new-format spreadsheet.' }
}

export async function criarSessao(
  _prevState: SessaoState,
  formData: FormData
): Promise<SessaoState> {
  const numEquipes = parseInt(formData.get('num_equipes') as string)
  if (!numEquipes || numEquipes < 1) return { error: 'Invalid number of teams.' }

  if (!(await isAdmin())) return { error: 'Not authorised.' }

  const warehouseId = formData.get('warehouse_id')
  if (typeof warehouseId !== 'string' || !warehouseId) return { error: 'Choose a warehouse.' }
  const db = await createClient()
  const { data: warehouse, error: warehouseError } = await db.from('warehouses').select('id').eq('id', warehouseId).single()
  if (warehouseError || !warehouse) return { error: 'Warehouse is unavailable.' }
  const { box_tare_g, tolerance_g } = await getDefaultTare()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('count_sessions')
    .insert({ status: 'aberta', box_tare_g, tolerance_g, warehouse_id: warehouse.id })
    .select('id')
    .single()

  if (error || !data) return { error: 'Error creating session.' }

  redirect(`/admin/sessao/${data.id}/equipes?n=${numEquipes}`)
}

export async function buscarInventarioParaDownload() {
  if (!(await isAdmin())) return null
  const supabase = await createClient()

  const [items, bins] = await Promise.all([
    fetchAllRows<{
      brand_code: string
      brand_name: string
      bpu: number
      pallet_size: number
      weight_avg: number
      category: string
      category1: string
    }>((from, to) =>
      supabase
        .from('inventory_items')
        .select('brand_code, brand_name, bpu, pallet_size, weight_avg, category, category1')
        .order('brand_code')
        .range(from, to)
    ),
    fetchAllRows<{ brand_code: string; bin_location: string }>((from, to) =>
      supabase
        .from('item_bin_locations')
        .select('brand_code, bin_location')
        .order('brand_code')
        .range(from, to)
    ),
  ])

  const binMap: Record<string, string[]> = {}
  for (const b of bins) {
    if (!binMap[b.brand_code]) binMap[b.brand_code] = []
    binMap[b.brand_code].push(b.bin_location)
  }

  return items.map((item) => {
    const b = binMap[item.brand_code] ?? []
    return {
      'Brand Code': item.brand_code,
      'Brand Name': item.brand_name,
      'Brand Purchase Unit': item.bpu,
      'Pallet Size': item.pallet_size,
      'Weight AVG': item.weight_avg ?? 0,
      'Category': item.category ?? '',
      'Category1': item.category1 ?? '',
      'BIN Location 1': b[0] ?? '',
      'BIN Location 2': b[1] ?? '',
      'BIN Location 3': b[2] ?? '',
      'BIN Location 4': b[3] ?? '',
    }
  })
}

export type EquipeInput = {
  team_name: string
  equipeNum: number
  pessoas: { nome: string; role: 'contador_1' | 'contador_2' | 'independente' }[]
}

export type Credencial = {
  team: string
  team_pin: string
  role: string
  name: string
  user_pin: string
}

function genPin(exclude: Set<string>): string {
  let pin: string
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000))
  } while (exclude.has(pin))
  exclude.add(pin)
  return pin
}

export async function criarEquipes(
  sessaoId: string,
  equipes: EquipeInput[]
): Promise<{ error?: string; credenciais?: Credencial[] }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const supabase = await createClient()
  const admin = createAdminClient()
  const credenciais: Credencial[] = []
  const usedTeamPins = new Set<string>()

  for (const equipe of equipes) {
    const teamPin = genPin(usedTeamPins)

    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .insert({ session_id: sessaoId, team_name: equipe.team_name, team_pin: teamPin })
      .select('id')
      .single()

    if (teamError || !teamData) {
      return { error: `Error creating team "${equipe.team_name}".` }
    }

    const usedUserPins = new Set<string>()

    for (const pessoa of equipe.pessoas) {
      const userPin = genPin(usedUserPins)
      const email = `${teamPin}${userPin}@count.local`

      const { data: userData, error: userError } = await admin.auth.admin.createUser({
        email,
        password: userPin,
        user_metadata: { full_name: pessoa.nome },
        email_confirm: true,
      })

      if (userError || !userData.user) {
        return { error: `Error creating user: ${userError?.message}` }
      }

      const { error: accountError } = await supabase.from('counter_accounts').insert({
        auth_user_id: userData.user.id,
        team_id: teamData.id,
        role: pessoa.role,
        username: `${teamPin}${userPin}`,
        user_pin: userPin,
      })

      if (accountError) {
        return { error: `Error saving account: ${accountError.message}` }
      }

      const { error: accessError } = await admin
        .from('app_user_access')
        .insert({ user_id: userData.user.id, access_kind: 'team_counter' })
      if (accessError) {
        await admin.auth.admin.deleteUser(userData.user.id)
        return { error: `Error saving account access: ${accessError.message}` }
      }

      credenciais.push({ team: equipe.team_name, team_pin: teamPin, role: pessoa.role, name: pessoa.nome, user_pin: userPin })
    }
  }

  return { credenciais }
}

// ─── Team management ────────────────────────────────────────────────────────

export type ContadorComCredencial = {
  auth_user_id: string
  team_id: string
  team_name: string
  team_pin: string
  role: string
  user_pin: string
  full_name: string
}

export async function listarEquipes(sessaoId: string): Promise<ContadorComCredencial[]> {
  if (!(await isAdmin())) return []
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: teams } = await supabase
    .from('teams')
    .select('id, team_name, team_pin')
    .eq('session_id', sessaoId)
    .order('team_name')

  if (!teams || teams.length === 0) return []

  const teamIds = teams.map((t) => t.id)

  const [{ data: accounts }, { data: { users } = { users: [] } }] = await Promise.all([
    supabase
      .from('counter_accounts')
      .select('auth_user_id, team_id, role, user_pin')
      .in('team_id', teamIds),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const nameMap: Record<string, string> = {}
  for (const u of users) {
    nameMap[u.id] = (u.user_metadata?.full_name as string) ?? ''
  }

  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]))

  return (accounts ?? []).map((a) => ({
    auth_user_id: a.auth_user_id,
    team_id: a.team_id,
    team_name: teamMap[a.team_id]?.team_name ?? '',
    team_pin: teamMap[a.team_id]?.team_pin ?? '',
    role: a.role,
    user_pin: a.user_pin,
    full_name: nameMap[a.auth_user_id] ?? '',
  }))
}

export async function renomearContador(
  authUserId: string,
  novoNome: string
): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    user_metadata: { full_name: novoNome.trim() },
  })
  return error ? { error: error.message } : {}
}

export async function deletarEquipe(teamId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: accounts } = await admin
    .from('counter_accounts')
    .select('auth_user_id')
    .eq('team_id', teamId)

  for (const acc of accounts ?? []) {
    await admin.auth.admin.deleteUser(acc.auth_user_id)
  }

  await admin.from('count_entries').delete().eq('team_id', teamId)
  await admin.from('reconciliation_items').delete().eq('team_id', teamId)
  await admin.from('counter_accounts').delete().eq('team_id', teamId)
  const { error } = await admin.from('teams').delete().eq('id', teamId)

  return error ? { error: error.message } : {}
}

export async function limparContagens(teamId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  await admin.from('count_entries').delete().eq('team_id', teamId)
  await admin.from('reconciliation_items').delete().eq('team_id', teamId)
  await admin
    .from('teams')
    .update({ status: 'contando', independente_confirmed_at: null })
    .eq('id', teamId)
  const { error } = await admin
    .from('counter_accounts')
    .update({ finalized_at: null })
    .eq('team_id', teamId)

  return error ? { error: error.message } : {}
}

export async function confirmarIndependente(teamId: string): Promise<{ error?: string }> {
  const access = await getTeamCounterAccess()
  if (!access || access.counterRole !== 'independente' || access.teamId !== teamId) {
    return { error: 'Unauthorized' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('teams')
    .update({ independente_confirmed_at: new Date().toISOString() })
    .eq('id', teamId)

  return error ? { error: error.message } : {}
}

// ─── Session management ──────────────────────────────────────────────────────

export async function forcarFecharSessao(sessionId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Not authorised.' }

  const admin = createAdminClient()
  const { data: teams } = await admin
    .from('teams')
    .select('id')
    .eq('session_id', sessionId)
    .eq('status', 'contando')

  for (const team of teams ?? []) {
    await admin.rpc('finalize_team_count', { p_team_id: team.id })
  }
  return {}
}

export async function deletarSessao(
  sessionId: string,
  deleteTeams: boolean,
): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Not authorised.' }

  const admin = createAdminClient()

  const { data: teams } = await admin
    .from('teams')
    .select('id')
    .eq('session_id', sessionId)

  const teamIds = (teams ?? []).map((t) => t.id)

  await admin.from('combined_results').delete().eq('session_id', sessionId)

  if (teamIds.length) {
    await admin.from('reconciliation_items').delete().in('team_id', teamIds)
    await admin.from('count_entries').delete().in('team_id', teamIds)
  }

  if (deleteTeams && teamIds.length) {
    const { data: accounts } = await admin
      .from('counter_accounts')
      .select('auth_user_id')
      .in('team_id', teamIds)
    for (const acc of accounts ?? []) {
      await admin.auth.admin.deleteUser(acc.auth_user_id)
    }
    await admin.from('counter_accounts').delete().in('team_id', teamIds)
    await admin.from('teams').delete().eq('session_id', sessionId)
  }

  const { error } = await admin.from('count_sessions').delete().eq('id', sessionId)
  return error ? { error: error.message } : {}
}
