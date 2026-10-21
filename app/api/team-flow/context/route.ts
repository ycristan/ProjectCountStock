import { getTeamFlowContexts } from '@/lib/team-flow-context'
import { reportTeamContextError } from '@/lib/report-team-context-error'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams
  const teamId = query.get('teamId') ?? undefined
  if ([...query.keys()].some(key => key !== 'teamId') || query.getAll('teamId').length > 1 ||
      (teamId !== undefined && !uuid.test(teamId))) {
    return Response.json({ error: 'Invalid team selection.' }, { status: 400, headers })
  }
  try {
    const result = await getTeamFlowContexts(teamId)
    if (!result.ok && result.reason === 'unauthenticated') {
      return Response.json({ error: 'Authentication required.' }, { status: 401, headers })
    }
    if (!result.ok) throw new Error('Context lookup unavailable')
    if (teamId && result.teams.length === 0) {
      return Response.json({ error: 'Team access unavailable.' }, { status: 404, headers })
    }
    return Response.json({ teams: result.teams }, { headers })
  } catch {
    const eventId = await reportTeamContextError()
    return Response.json({ error: 'Unable to load team access. Please try again later.', eventId },
      { status: 503, headers })
  }
}
