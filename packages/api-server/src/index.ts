import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { ApiError, Errors } from './lib/errors.js'
import { apiKeyAuth } from './middleware/apiKeyAuth.js'
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware.js'
import { supabaseJwtAuth, adminAuth } from './middleware/adminAuth.js'
import { proxyRoutes } from './routes/proxy.js'
import { authRoutes } from './routes/auth.js'
import { keysRoutes } from './routes/keys.js'
import { adminRoutes } from './routes/admin.js'
import { topupRoutes, topupWebhookRoute } from './routes/topup.js'
import { analyticsRoutes } from './routes/analytics.js'
import { webhookRoutes } from './routes/webhooks.js'

export function createApp() {
  const app = new Hono()

  // Global CORS — allow all origins in development, restrict in production
  const isDev = process.env.NODE_ENV !== 'production'
  app.use(
    '*',
    cors({
      origin: isDev
        ? '*'
        : [process.env.WEB_ADMIN_URL ?? 'http://localhost:3001'].filter(Boolean),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  )

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // Proxy routes (API Key auth)
  const v1 = new Hono()
  v1.use('*', apiKeyAuth)
  v1.use('*', rateLimitMiddleware)
  v1.route('/', proxyRoutes())
  app.route('/v1', v1)

  // Auth routes (no auth required for login)
  app.route('/auth', authRoutes())

  // Keys routes (Supabase JWT auth)
  const keys = new Hono()
  keys.use('*', supabaseJwtAuth)
  keys.route('/', keysRoutes())
  app.route('/keys', keys)

  // Usage routes (API Key or JWT) — usage/summary is served under /v1/usage/summary via proxy routes
  const usage = new Hono()
  app.route('/usage', usage)

  // Topup webhook — no auth, must be registered BEFORE the JWT-protected /topup/* group
  const webhook = topupWebhookRoute()
  app.route('/topup/webhook', webhook)

  // Topup routes (Supabase JWT auth)
  const topup = new Hono()
  topup.use('*', supabaseJwtAuth)
  topup.route('/', topupRoutes())
  app.route('/topup', topup)

  // Analytics routes (Supabase JWT auth)
  const analytics = new Hono()
  analytics.use('*', supabaseJwtAuth)
  analytics.route('/', analyticsRoutes())
  app.route('/analytics', analytics)

  // Webhook notification routes (Supabase JWT auth)
  const webhooks = new Hono()
  webhooks.use('*', supabaseJwtAuth)
  webhooks.route('/', webhookRoutes())
  app.route('/webhooks', webhooks)

  // Admin routes (Admin JWT auth)
  const admin = new Hono()
  admin.use('*', adminAuth)
  admin.route('/', adminRoutes())
  app.route('/admin', admin)

  // 404 catch-all
  app.notFound(() => Errors.notFound())

  // Global error handler — returns OpenAI-compatible format
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return err.toResponse()
    }
    console.error('Unhandled error:', err)
    return Errors.internalError()
  })

  return app
}

// Start server when run directly (not during testing)
if (process.env.NODE_ENV !== 'test') {
  const app = createApp()
  const port = Number(process.env.PORT ?? 3000)

  serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    console.log(`Apiex API Server listening on http://localhost:${info.port}`)
  })
}
