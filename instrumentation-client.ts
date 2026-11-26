import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // VERCEL_ENV does not reach the browser: without this, preview errors were tagged production.
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies
      delete event.request.headers
      delete event.request.data
    }

    delete event.user
    return event
  },
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
