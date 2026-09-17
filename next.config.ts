import type { NextConfig } from 'next'

const nextConfig: NextConfig = { experimental: { serverActions: { bodySizeLimit: '4.4mb' } } }

export default nextConfig
