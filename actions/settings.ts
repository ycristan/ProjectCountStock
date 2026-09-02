'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/authorization'

export async function getDefaultTare(): Promise<{ box_tare_g: number; tolerance_g: number }> {
  if (!(await isAdmin())) return { box_tare_g: 300, tolerance_g: 0 }

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

function genPin(exclude: Set<string>): string {
  let pin: string
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000))
  } while (exclude.has(pin))
  exclude.add(pin)
  return pin
}

async function getSoloCounterId(): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('app_user_access')
    .select('user_id')
    .eq('access_kind', 'solo_counter')
    .maybeSingle()
  return data?.user_id ?? null
}

export async function statusContadorSoloFixo(): Promise<{ active: boolean }> {
  if (!(await isAdmin())) return { active: false }
  return { active: Boolean(await getSoloCounterId()) }
}

export async function criarContadorSoloFixo(): Promise<{
  team_pin?: string
  user_pin?: string
  error?: string
}> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const existingId = await getSoloCounterId()
  if (existingId) {
    const { error } = await admin.auth.admin.deleteUser(existingId)
    if (error) return { error: `Error retiring previous account: ${error.message}` }
  }

  const { data: teams } = await admin.from('teams').select('team_pin')
  const usedTeamPins = new Set((teams ?? []).map((t) => t.team_pin))
  const { data: { users }, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) return { error: `Error checking existing logins: ${listError.message}` }
  for (const u of users) {
    if (u.email?.endsWith('@count.local')) usedTeamPins.add(u.email.slice(0, 4))
  }

  const teamPin = genPin(usedTeamPins)
  const userPin = genPin(new Set())
  const email = `${teamPin}${userPin}@count.local`
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password: userPin,
    email_confirm: true,
  })
  if (userError || !userData.user) return { error: `Error creating account: ${userError?.message}` }

  const { error: accessError } = await admin
    .from('app_user_access')
    .insert({ user_id: userData.user.id, access_kind: 'solo_counter' })
  if (accessError) {
    await admin.auth.admin.deleteUser(userData.user.id)
    return { error: `Error saving account access: ${accessError.message}` }
  }

  return { team_pin: teamPin, user_pin: userPin }
}

export async function deletarContadorSoloFixo(): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const existingId = await getSoloCounterId()
  if (!existingId) return {}

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(existingId)
  return error ? { error: error.message } : {}
}
