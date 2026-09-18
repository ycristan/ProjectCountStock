import * as Sentry from '@sentry/nextjs'

export async function reportInventoryExportError(reason: 'schema_unavailable' | 'export_failed') {
  let eventId: string | undefined
  let monitoring = 'unavailable'
  try {
    if (Sentry.getClient()?.getOptions().dsn) {
      Sentry.withScope(scope => {
        // Do not attach session, request, inventory contents or raw database errors.
        scope.clear()
        scope.setTag('operation', 'inventory.zip')
        scope.setTag('reason', reason)
        eventId = Sentry.captureException(new Error('Inventory ZIP export failed: ' + reason))
      })
      monitoring = await Sentry.flush(2000) ? 'flushed' : 'flush_incomplete'
    }
  } catch { monitoring = 'transport_failed' }
  // Independent, sanitized fallback even when Sentry is disabled or unreachable.
  console.error('inventory_export_failed', { reason, eventId, monitoring })
  return eventId
}
