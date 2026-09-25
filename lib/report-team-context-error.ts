import * as Sentry from '@sentry/nextjs'

export async function reportTeamContextError(operation: 'team.context' | 'team.setup' = 'team.context') {
  let eventId: string | undefined
  let monitoring = 'unavailable'
  try {
    if (Sentry.getClient()?.getOptions().dsn) {
      Sentry.withScope(scope => {
        scope.clear()
        scope.setTag('operation', operation)
        eventId = Sentry.captureException(new Error(operation === 'team.setup' ? 'Team setup incomplete' : 'Team context lookup unavailable'))
      })
      monitoring = await Sentry.flush(2000) ? 'flushed' : 'flush_incomplete'
    }
  } catch { monitoring = 'transport_failed' }
  // Never log identity, cookies, PINs, requested team or raw database errors.
  console.error(operation === 'team.setup' ? 'team_setup_failed' : 'team_context_unavailable', { eventId, monitoring })
  return eventId
}
