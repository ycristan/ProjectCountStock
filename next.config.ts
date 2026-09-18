import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = { experimental: { serverActions: { bodySizeLimit: '4.4mb' } } }

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
})
