import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/authorization'
import { createClient } from '@/lib/supabase-server'
import { loadTeamSessionReport } from '@/lib/team-session-data'
import { teamSessionSheets } from '@/lib/team-session-report'
import { xlsxResponse } from '@/lib/xlsx-download'
import { reportTeamContextError } from '@/lib/report-team-context-error'

// Final workbook of a closed team session (block 12): built only from the frozen consolidation.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.TEAM_SETUP_ENABLED !== 'true' || !(await isAdmin())) return new NextResponse('Unauthorized', { status: 401 })
  const { id } = await params
  try {
    const report = await loadTeamSessionReport(await createClient(), id)
    if (!report) return new NextResponse('Session not closed yet', { status: 409 })
    return xlsxResponse(teamSessionSheets(report.teams, report.consolidated), 'contagem-equipes-' + id.slice(0, 8) + '.xlsx')
  } catch {
    await reportTeamContextError('team.count')
    return new NextResponse('Report unavailable', { status: 500 })
  }
}
