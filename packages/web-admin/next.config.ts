import type { NextConfig } from 'next'
import path from 'path'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  typescript: { ignoreBuildErrors: false },
}

export default withNextIntl(nextConfig)
