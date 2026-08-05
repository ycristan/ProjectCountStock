'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.user_metadata?.role === 'admin'
}

// ponytail: shared by criarSoloSessaoCompleta (solo.ts) and criarSessao (sessao.ts) —
// both need the current tare/tolerance defaults but neither is itself the settings-page
// data-loader, so this isn't gated by isAdmin() — callers are already admin-gated themselves
export async function getDefaultTare(): Promise<{ box_tare_g: number; tolerance_g: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('app_settings')
    .select('default_box_tare_g, default_tolerance_g')
    .eq('id', 1)
    .single()
  if (error) console.error('getDefaultTare: failed to fetch settings, using fallback', error)
  return {
    box_tare_g: data?.default_box_tare_g ?? 300,
    tolerance_g: data?.default_tolerance_g ?? 0,
  }
}

// ─── Defaults + notify e-mail ───────────────────────────────────────────────

export async function buscarConfigSistema(): Promise<{
  default_box_tare_g: number
  default_tolerance_g: number
  notify_email: string
}> {
  if (!(await isAdmin())) return { default_box_tare_g: 300, default_tolerance_g: 0, notify_email: '' }
  const admin = createAdminClient()
  const { data } = await admin
    .from('app_settings')
    .select('default_box_tare_g, default_tolerance_g, notify_email')
    .eq('id', 1)
    .single()
  return {
    default_box_tare_g: data?.default_box_tare_g ?? 300,
    default_tolerance_g: data?.default_tolerance_g ?? 0,
    notify_email: data?.notify_email ?? '',
  }
}

export async function salvarConfigSistema(input: {
  default_box_tare_g: number
  default_tolerance_g: number
  notify_email: string
}): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  if (!Number.isInteger(input.default_box_tare_g) || input.default_box_tare_g <= 0) {
    return { error: 'Tare must be a positive whole number.' }
  }
  if (!Number.isInteger(input.default_tolerance_g) || input.default_tolerance_g < 0) {
    return { error: 'Tolerance must be zero or a positive whole number.' }
  }
  const trimmed = input.notify_email.trim()
  if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { error: 'Invalid email address.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('app_settings')
    .update({
      default_box_tare_g: input.default_box_tare_g,
      default_tolerance_g: input.default_tolerance_g,
      notify_email: trimmed || null,
    })
    .eq('id', 1)
  return error ? { error: error.message } : {}
}

// ─── Fixed solo counter account (one at a time) ─────────────────────────────

function genPin(exclude: Set<string>): string {
  let pin: string
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000))
  } while (exclude.has(pin))
  exclude.add(pin)
  return pin
}

export async function statusContadorSoloFixo(): Promise<{ active: boolean }> {
  if (!(await isAdmin())) return { active: false }
  const admin = createAdminClient()
  const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) return { active: false }
  return { active: users.some((u) => u.user_metadata?.is_solo_counter === true) }
}

export async function criarContadorSoloFixo(): Promise<{
  team_pin?: string
  user_pin?: string
  error?: string
}> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  // ponytail: only one fixed solo counter at a time — creating a new one retires the old
  const { data: { users: before }, error: listError1 } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError1) return { error: `Error checking existing accounts: ${listError1.message}` }
  const existing = before.find((u) => u.user_metadata?.is_solo_counter === true)
  if (existing) {
    const { error: delError } = await admin.auth.admin.deleteUser(existing.id)
    if (delError) return { error: `Error retiring previous account: ${delError.message}` }
  }

  const { data: teams } = await admin.from('teams').select('team_pin')
  const usedTeamPins = new Set((teams ?? []).map((t) => t.team_pin))
  const { data: { users: after }, error: listError2 } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError2) return { error: `Error checking existing logins: ${listError2.message}` }
  for (const u of after) {
    if (u.email?.endsWith('@count.local')) usedTeamPins.add(u.email.slice(0, 4))
  }

  const teamPin = genPin(usedTeamPins)
  const userPin = genPin(new Set())
  const email = `${teamPin}${userPin}@count.local`

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password: userPin,
    user_metadata: { role: 'counter', is_solo_counter: true },
    email_confirm: true,
  })
  if (userError || !userData.user) return { error: `Error creating account: ${userError?.message}` }

  return { team_pin: teamPin, user_pin: userPin }
}

export async function deletarContadorSoloFixo(): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { data: { users }, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) return { error: listError.message }
  const existing = users.find((u) => u.user_metadata?.is_solo_counter === true)
  if (!existing) return {}
  const { error } = await admin.auth.admin.deleteUser(existing.id)
  return error ? { error: error.message } : {}
}
