'use server'

import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { redirect } from 'next/navigation'

type UploadState = { error?: string; success?: boolean; count?: number } | null
type SessaoState = { error?: string } | null

export async function uploadInventory(
  _prevState: UploadState,
  formData: FormData
): Promise<UploadState> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'Nenhum arquivo selecionado.' }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

  const items = rows
    .map((row) => ({
      brand_code: String(row['Brand Code'] ?? row['brand_code'] ?? '').trim(),
      brand_name: String(row['Brand Name'] ?? row['brand_name'] ?? '').trim(),
      bpu: Number(row['Brand Purchase Unit'] ?? row['bpu'] ?? 0),
      pallet_size: Number(row['Pallet Size'] ?? row['pallet_size'] ?? 0),
      bins: [1, 2, 3, 4]
        .map((i) => String(row[`BIN Location ${i}`] ?? '').trim())
        .filter(Boolean),
    }))
    .filter((i) => i.brand_code && i.bpu > 0 && i.pallet_size > 0)

  if (items.length === 0) return { error: 'Nenhum item válido encontrado no arquivo.' }

  const supabase = await createClient()

  const { error: itemsError } = await supabase.from('inventory_items').upsert(
    items.map(({ brand_code, brand_name, bpu, pallet_size }) => ({
      brand_code,
      brand_name,
      bpu,
      pallet_size,
    }))
  )
  if (itemsError) return { error: `Erro ao salvar itens: ${itemsError.message}` }

  const binRows = items.flatMap(({ brand_code, bins }) =>
    bins.map((bin_location) => ({ brand_code, bin_location }))
  )
  if (binRows.length > 0) {
    const { error: binsError } = await supabase
      .from('item_bin_locations')
      .upsert(binRows, { onConflict: 'brand_code,bin_location', ignoreDuplicates: true })
    if (binsError) return { error: `Erro ao salvar BINs: ${binsError.message}` }
  }

  return { success: true, count: items.length }
}

export async function criarSessao(
  _prevState: SessaoState,
  formData: FormData
): Promise<SessaoState> {
  const numEquipes = parseInt(formData.get('num_equipes') as string)
  if (!numEquipes || numEquipes < 1) return { error: 'Número de equipes inválido.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('count_sessions')
    .insert({ status: 'aberta' })
    .select('id')
    .single()

  if (error || !data) return { error: 'Erro ao criar sessão.' }

  redirect(`/admin/sessao/${data.id}/equipes?n=${numEquipes}`)
}

export type EquipeInput = {
  team_name: string
  equipeNum: number
  pessoas: { nome: string; role: 'contador_1' | 'contador_2' | 'independente' }[]
}

export type Credencial = {
  team: string
  username: string
  pin: string
  role: string
}

export async function criarEquipes(
  sessaoId: string,
  equipes: EquipeInput[]
): Promise<{ error?: string; credenciais?: Credencial[] }> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const credenciais: Credencial[] = []

  const roleShort: Record<string, string> = {
    contador_1: 'c1',
    contador_2: 'c2',
    independente: 'ind',
  }

  for (const equipe of equipes) {
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .insert({ session_id: sessaoId, team_name: equipe.team_name })
      .select('id')
      .single()

    if (teamError || !teamData) {
      return { error: `Erro ao criar equipe "${equipe.team_name}".` }
    }

    for (const pessoa of equipe.pessoas) {
      const slug = pessoa.nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '')
      const username = `${slug}.eq${equipe.equipeNum}.${roleShort[pessoa.role]}`
      const pin = String(Math.floor(1000 + Math.random() * 9000))
      const email = `${username}@count.local`

      const { data: userData, error: userError } = await admin.auth.admin.createUser({
        email,
        password: pin,
        user_metadata: { role: 'counter', team_id: teamData.id, counter_role: pessoa.role },
        email_confirm: true,
      })

      if (userError || !userData.user) {
        return { error: `Erro ao criar usuário "${username}": ${userError?.message}` }
      }

      const { error: accountError } = await supabase.from('counter_accounts').insert({
        auth_user_id: userData.user.id,
        team_id: teamData.id,
        role: pessoa.role,
        username,
      })

      if (accountError) {
        return { error: `Erro ao salvar conta "${username}": ${accountError.message}` }
      }

      credenciais.push({ team: equipe.team_name, username, pin, role: pessoa.role })
    }
  }

  return { credenciais }
}
