import * as Sentry from '@sentry/nextjs'

export async function reportTeamContextError() {
  let eventId: string | undefined
  let monitoring = 'unavailable'
  try {
    if (Sentry.getClient()?.getOptions().dsn) {
      Sentry.withScope(scope => {
        scope.clear()
        scope.setTag('operation', 'team.context')
        eventId = Sentry.captureException(new Error('Team context lookup unavailable'))
      })
      monitoring = await Sentry.flush(2000) ? 'flushed' : 'flush_incomplete'
    }
  } catch { monitoring = 'transport_failed' }
  // Never log identity, cookies, PINs, requested team or raw database errors.
  console.error('team_context_unavailable', { eventId, monitoring })
  return eventId
}
