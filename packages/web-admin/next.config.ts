import type { NextConfig } from 'next'
import path from 'path'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
}

export default withNextIntl(nextConfig)
