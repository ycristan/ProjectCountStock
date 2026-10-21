import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/authorization'
import { createClient } from '@/lib/supabase-server'
import { loadTeamAudit } from '@/lib/team-session-data'
import { teamAuditSheets } from '@/lib/team-audit-report'
import { xlsxResponse } from '@/lib/xlsx-download'
import { reportTeamContextError } from '@/lib/report-team-context-error'

// Audit Count: everything each person entered in the team session, at any stage.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true' || !(await isAdmin())) return new NextResponse('Unauthorized', { status: 401 })
  const { id } = await params
  try {
    const audit = await loadTeamAudit(await createClient(), id)
    if (!audit) return new NextResponse('Session has no teams', { status: 404 })
    return xlsxResponse(teamAuditSheets(audit.counts, audit.reconciliations, audit.events), 'audit-count-' + id.slice(0, 8) + '.xlsx')
  } catch {
    await reportTeamContextError('team.count')
    return new NextResponse('Audit unavailable', { status: 500 })
  }
}
