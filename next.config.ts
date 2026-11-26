import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: '4.4mb' } },
  // Build-time copy for the browser Sentry tag (production / preview), set by Vercel at build.
  env: { NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? '' },
}

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
})
