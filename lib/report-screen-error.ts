import * as Sentry from '@sentry/nextjs'

// Browser-side failures that the person only sees as a message on screen (no response, team
// unreadable). The server never hears about them, so report them here: kind, error type and
// whether the phone thought it was online. Never ids, names, PINs or payloads.
// shortcut: once per kind per page load, so an offline phone polling every 15 s cannot flood the quota.
const reported = new Set<string>()

export function reportScreenError(kind: 'team.read' | 'team.save' | 'team.reconcile' | 'live.read', error: unknown) {
  if (reported.has(kind)) return
  reported.add(kind)
  Sentry.withScope(scope => {
    scope.setLevel('warning')
    scope.setTag('operation', kind)
    scope.setTag('error_type', error instanceof Error ? error.name : typeof error)
    scope.setTag('online', String(typeof navigator === 'undefined' ? 'unknown' : navigator.onLine))
    scope.setFingerprint(['screen-error', kind])
    Sentry.captureMessage('Shown on screen: ' + kind)
  })
}
