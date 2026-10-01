'use server'

import { createClient } from '@/lib/supabase-server'
import { reportTeamContextError } from '@/lib/report-team-context-error'
import type { ItemBusca, LancarContagemPayload, LancarContagemResult } from '@/actions/contagem'
import type { TeamCountState } from '@/lib/team-count-types'

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
    p_weight_avg: item.weight_avg, p_tare: item.box_tare_g,
  })
  if (error) {
    if (!['40001', '42501', '22023'].includes(error.code)) await reportTeamContextError('team.count')
    return { error: error.code === '40001'
      ? 'Count or product changed. Close this form, refresh and retry.'
      : 'Count was not confirmed. Check access and retry.' }
  }
  return data as LancarContagemResult
}
