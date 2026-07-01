'use server'

import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { redirect } from 'next/navigation'

type UploadState = { error?: string; success?: boolean; count?: number; skipped?: number } | null
type SessaoState = { error?: string } | null

export async function uploadInventory(
  _prevState: UploadState,
  formData: FormData
): Promise<UploadState> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'No file selected.' }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

  const allItems = rows.map((row) => ({
    brand_code: String(row['Brand Code'] ?? row['brand_code'] ?? '').trim(),
    brand_name: String(row['Brand Name'] ?? row['brand_name'] ?? '').trim(),
    bpu: Number(row['Brand Purchase Unit'] ?? row['bpu'] ?? 0),
    pallet_size: Number(row['Pallet Size'] ?? row['pallet_size'] ?? 0),
    weight_avg: Number(row['Weight AVG'] ?? row['weight_avg'] ?? 0),
    category: String(row['Category'] ?? row['category'] ?? '').trim(),
    category1: String(row['Category1'] ?? row['category1'] ?? '').trim(),
    bins: [1, 2, 3, 4]
      .map((i) => String(row[`BIN Location ${i}`] ?? '').trim())
      .filter(Boolean),
  }))

  // ponytail: brand_code é o único campo obrigatório; bpu/pallet_size podem ser 0
  const items = allItems.filter((i) => !!i.brand_code)
  const skipped = allItems.length - items.length

  if (items.length === 0)
    return { error: 'No items with Brand Code found in the file.' }

  const supabase = await createClient()

  const { error: itemsError } = await supabase.from('inventory_items').upsert(
    items.map(({ brand_code, brand_name, bpu, pallet_size, weight_avg, category, category1 }) => ({
      brand_code,
      brand_name,
      bpu,
      pallet_size,
      weight_avg,
      category,
      category1,
    }))
  )
  if (itemsError) return { error: `Error saving items: ${itemsError.message}` }

  // Sync completo: a lista nova é a fonte da verdade — remove o que não está nela
  const newCodes = items.map((i) => i.brand_code)
  const notIn = `(${newCodes.join(',')})`

  const { error: delItemsError } = await supabase
    .from('inventory_items')
    .delete()
    .not('brand_code', 'in', notIn)
  if (delItemsError) return { error: `Error removing old items: ${delItemsError.message}` }

  const { error: delOldBinsError } = await supabase
    .from('item_bin_locations')
    .delete()
    .not('brand_code', 'in', notIn)
  if (delOldBinsError) return { error: `Error removing old BINs: ${delOldBinsError.message}` }

  // ponytail: delete + insert garante replace limpo dos BINs por item
  const { error: delBinsError } = await supabase
    .from('item_bin_locations')
    .delete()
    .in('brand_code', newCodes)
  if (delBinsError) return { error: `Error updating BINs: ${delBinsError.message}` }

  const binRows = items.flatMap(({ brand_code, bins }) =>
    bins.map((bin_location) => ({ brand_code, bin_location }))
  )
  if (binRows.length > 0) {
    const { error: binsError } = await supabase.from('item_bin_locations').insert(binRows)
    if (binsError) return { error: `Error saving BINs: ${binsError.message}` }
  }

  return { success: true, count: items.length, skipped: skipped > 0 ? skipped : undefined }
}

export async function criarSessao(
  _prevState: SessaoState,
  formData: FormData
): Promise<SessaoState> {
  const numEquipes = parseInt(formData.get('num_equipes') as string)
  if (!numEquipes || numEquipes < 1) return { error: 'Invalid number of teams.' }

  const box_tare_g = Math.max(1, parseInt(formData.get('box_tare_g') as string) || 300)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('count_sessions')
    .insert({ status: 'aberta', box_tare_g })
    .select('id')
    .single()

  if (error || !data) return { error: 'Error creating session.' }

  redirect(`/admin/sessao/${data.id}/equipes?n=${numEquipes}`)
}

export async function buscarInventarioParaDownload() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role === 'counter') return null

  const [{ data: items }, { data: bins }] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('brand_code, brand_name, bpu, pallet_size, weight_avg, category, category1')
      .order('brand_code'),
    supabase
      .from('item_bin_locations')
      .select('brand_code, bin_location')
      .order('brand_code'),
  ])

  const binMap: Record<string, string[]> = {}
  for (const b of bins ?? []) {
    if (!binMap[b.brand_code]) binMap[b.brand_code] = []
    binMap[b.brand_code].push(b.bin_location)
  }

  return (items ?? []).map((item) => {
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
        user_metadata: {
          role: 'counter',
          team_id: teamData.id,
          counter_role: pessoa.role,
          full_name: pessoa.nome,
        },
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
    const tid = u.user_metadata?.team_id as string
    const role = u.user_metadata?.counter_role as string
    const name = u.user_metadata?.full_name as string
    if (tid && role) nameMap[`${tid}:${role}`] = name ?? ''
  }

  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]))

  return (accounts ?? []).map((a) => ({
    auth_user_id: a.auth_user_id,
    team_id: a.team_id,
    team_name: teamMap[a.team_id]?.team_name ?? '',
    team_pin: teamMap[a.team_id]?.team_pin ?? '',
    role: a.role,
    user_pin: a.user_pin,
    full_name: nameMap[`${a.team_id}:${a.role}`] ?? '',
  }))
}

export async function renomearContador(
  authUserId: string,
  novoNome: string
): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    user_metadata: { full_name: novoNome.trim() },
  })
  return error ? { error: error.message } : {}
}

export async function deletarEquipe(teamId: string): Promise<{ error?: string }> {
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
  const admin = createAdminClient()

  await admin.from('count_entries').delete().eq('team_id', teamId)
  await admin.from('reconciliation_items').delete().eq('team_id', teamId)
  await admin.from('teams').update({ status: 'contando' }).eq('id', teamId)
  const { error } = await admin
    .from('counter_accounts')
    .update({ finalized_at: null })
    .eq('team_id', teamId)

  return error ? { error: error.message } : {}
}
