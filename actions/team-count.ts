'use server'

import { createClient } from '@/lib/supabase-server'
import { reportTeamContextError } from '@/lib/report-team-context-error'
import type { ItemBusca, LancarContagemPayload, LancarContagemResult } from '@/actions/contagem'
import type { TeamComparisonItem, TeamCountState } from '@/lib/team-count-types'

export async function readTeamCount(teamId: string): Promise<TeamCountState | null> {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return null
  const db = await createClient()
  const { data, error } = await db.rpc('read_team_count', { p_team: teamId })
  if (error) {
    if (error.code !== '42501') await reportTeamContextError('team.count')
    return null
  }
  return data as TeamCountState
}

export async function readTeamInventory(teamId: string): Promise<ItemBusca[] | null> {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return null
  const db = await createClient()
  const { data, error } = await db.rpc('read_team_inventory', { p_team: teamId })
  if (error) {
    if (error.code !== '42501') await reportTeamContextError('team.count')
    return null
  }
  return (data as Omit<ItemBusca, 'jaContado' | 'entryExistente'>[])
    .map(item => ({ ...item, jaContado: false, entryExistente: null }))
}

// Individual finish (R03): the database checks identity, role, phase and revision.
async function finishCommand(rpc: 'request_team_finish' | 'decide_team_finish', args: Record<string, unknown>) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return { error: 'Team access unavailable.' }
  const db = await createClient()
  const { error } = await db.rpc(rpc, args)
  if (!error) return {}
  if (!['40001', '42501', 'P0001'].includes(error.code)) await reportTeamContextError('team.count')
  return { error: error.code === '40001' ? 'The team changed. Refresh and try again.' : 'Not confirmed. Refresh and try again.' }
}

export async function requestTeamFinish(teamId: string, membershipId: string, revision: string, command: string) {
  return finishCommand('request_team_finish',
    { p_team: teamId, p_membership: membershipId, p_expected_revision: revision, p_command: command })
}

export async function decideTeamFinish(teamId: string, membershipId: string, accept: boolean, revision: string, command: string) {
  return finishCommand('decide_team_finish',
    { p_team: teamId, p_membership: membershipId, p_accept: accept, p_expected_revision: revision, p_command: command })
}

// Block 6: comparison is read by the Independent/admin only; counters stay blind.
export async function readTeamComparison(teamId: string): Promise<TeamComparisonItem[] | null> {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return null
  const db = await createClient()
  const { data, error } = await db.rpc('read_team_comparison', { p_team: teamId })
  if (error) {
    if (error.code !== '42501') await reportTeamContextError('team.count')
    return null
  }
  return data as TeamComparisonItem[]
}

// recordId = chosen count inside weight tolerance; null = send to reconciliation.
export async function decideTeamItem(teamId: string, brand: string, recordId: string | null, revision: string, command: string) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return { error: 'Team access unavailable.' }
  const db = await createClient()
  const { error } = await db.rpc('decide_team_item', {
    p_team: teamId, p_brand: brand, p_record: recordId, p_expected_revision: revision, p_command: command,
  })
  if (!error) return {}
  if (!['40001', '42501', '22023', 'P0001'].includes(error.code)) await reportTeamContextError('team.count')
  return { error: error.code === '40001' ? 'The team changed. Refresh and try again.' : 'Not confirmed. Refresh and try again.' }
}

export async function startTeamCount(teamId: string, revision: string) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return { error: 'Team access unavailable.' }
  const db = await createClient()
  const { error } = await db.rpc('start_team_count', { p_team: teamId, p_revision: revision })
  if (error) return { error: 'Unable to start. Refresh and retry.' }
  return {}
}

export async function saveTeamCount(teamId: string, command: string, revision: string | null,
  item: ItemBusca, payload: LancarContagemPayload): Promise<LancarContagemResult> {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return { error: 'Team access unavailable.' }
  const db = await createClient()
  const { data, error } = await db.rpc('save_team_count', {
    p_team: teamId, p_command: command, p_brand: payload.brand_code, p_revision: revision,
    p_pallets: payload.pallets, p_cases: payload.cases, p_units: payload.units,
    p_weight: payload.is_weight_count ?? false, p_bpu: item.bpu, p_pallet_size: item.pallet_size,
    p_weight_avg: item.weight_avg, p_tare: item.box_tare_g, p_weighing: payload.weighing ?? null,
  })
  if (error) {
    if (!['40001', '42501', '22023'].includes(error.code)) await reportTeamContextError('team.count')
    return { error: error.code === '40001'
      ? 'Count or product changed. Close this form, refresh and retry.'
      : 'Count was not confirmed. Check access and retry.' }
  }
  return data as LancarContagemResult
}

// Block 7 (R06): reconciled count by the Independent, same form and checks as a count.
export async function saveTeamReconciliation(teamId: string, command: string, revision: string,
  item: ItemBusca, payload: LancarContagemPayload): Promise<LancarContagemResult> {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return { error: 'Team access unavailable.' }
  const db = await createClient()
  const { data, error } = await db.rpc('save_team_reconciliation', {
    p_team: teamId, p_command: command, p_brand: payload.brand_code, p_expected_revision: revision,
    p_pallets: payload.pallets, p_cases: payload.cases, p_units: payload.units,
    p_weight: payload.is_weight_count ?? false, p_bpu: item.bpu, p_pallet_size: item.pallet_size,
    p_weight_avg: item.weight_avg, p_tare: item.box_tare_g, p_weighing: payload.weighing ?? null,
  })
  if (error) {
    if (!['40001', '42501', '22023', 'P0001'].includes(error.code)) await reportTeamContextError('team.count')
    return { error: error.code === '40001'
      ? 'The team or product changed. Close this form, refresh and retry.'
      : 'Reconciliation was not confirmed. Refresh and retry.' }
  }
  return data as LancarContagemResult
}

// R07: every counted product must be resolved; the database seals the result for the admin.
export async function submitTeamReconciliation(teamId: string, revision: string, command: string) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true') return { error: 'Team access unavailable.' }
  const db = await createClient()
  const { error } = await db.rpc('submit_team_reconciliation',
    { p_team: teamId, p_expected_revision: revision, p_command: command })
  if (!error) return {}
  if (!['40001', '42501', '22023', 'P0001'].includes(error.code)) await reportTeamContextError('team.count')
  return { error: error.code === '40001' ? 'The team changed. Refresh and try again.'
    : error.message === 'Every item must be resolved before submitting'
      ? 'Every item must be resolved before submitting.' : 'Not submitted. Refresh and try again.' }
}
