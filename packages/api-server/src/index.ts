import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Errors } from './lib/errors.js'
import { apiKeyAuth } from './middleware/apiKeyAuth.js'
import { supabaseJwtAuth, adminAuth } from './middleware/adminAuth.js'

export function createApp() {
  const app = new Hono()

  // Global CORS
  app.use(
    '*',
    cors({
      origin: ['http://localhost:3001', process.env.WEB_ADMIN_URL ?? ''].filter(Boolean),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  )

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // Proxy routes (API Key auth)
  const v1 = new Hono()
  v1.use('*', apiKeyAuth)
  // T09 will add: v1.post('/chat/completions', proxyHandler)
  // T09 will add: v1.get('/models', modelsHandler)
  app.route('/v1', v1)

  // Auth routes (no auth required for login)
  const auth = new Hono()
  // T10 will add auth routes
  app.route('/auth', auth)

  // Keys routes (Supabase JWT auth)
  const keys = new Hono()
  keys.use('*', supabaseJwtAuth)
  // T11 will add keys CRUD routes
  app.route('/keys', keys)

  // Usage routes (API Key or JWT)
  const usage = new Hono()
  // T09 will add usage summary
  app.route('/usage', usage)

  // Admin routes (Admin JWT auth)
  const admin = new Hono()
  admin.use('*', adminAuth)
  // T12 will add admin routes
  app.route('/admin', admin)

  // 404 catch-all
  app.notFound(() => Errors.notFound())

  // Global error handler
  app.onError((err, c) => {
    console.error('Unhandled error:', err)
    return Errors.internalError()
  })

  return app
}

// Start server when run directly
const app = createApp()
const port = Number(process.env.PORT ?? 3000)

export default {
  port,
  fetch: app.fetch,
}
