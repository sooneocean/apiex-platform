import { Hono } from 'hono'
import { TopupService } from '../services/TopupService.js'
import { Errors } from '../lib/errors.js'

/**
 * TopupService is lazily instantiated on first request to avoid Stripe
 * client initialization (which requires STRIPE_SECRET_KEY) at module load
 * time — relevant for test environments where the env var may not be set.
 */
function makeServiceGetter() {
  let svc: TopupService | null = null
  return () => {
    if (!svc) svc = new TopupService()
    return svc
  }
}

/**
 * topupRoutes — JWT-protected routes mounted at /topup.
 * Auth (supabaseJwtAuth) is applied by the parent app in index.ts.
 */
export function topupRoutes() {
  const router = new Hono()
  const getService = makeServiceGetter()

  /**
   * POST /topup/checkout
   * Body: { plan_id: string }
   * Response: { data: { checkout_url, session_id } }
   */
  router.post('/checkout', async (c) => {
    const userId = c.get('userId') as string
    const body = await c.req.json<{ plan_id?: string }>().catch(() => ({}))
    const planId = body.plan_id ?? ''

    try {
      const result = await getService().createCheckoutSession(userId, planId)
      return c.json({ data: result })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.startsWith('Invalid plan:')) {
        return Errors.invalidPlan()
      }
      return Errors.stripeError(msg)
    }
  })

  /**
   * GET /topup/status?session_id=<id>
   * Response: { data: { status, tokens_granted?, completed_at? } }
   */
  router.get('/status', async (c) => {
    const sessionId = c.req.query('session_id')
    if (!sessionId) {
      return Errors.missingSessionId()
    }

    const result = await getService().getTopupStatus(sessionId)
    return c.json({ data: result })
  })

  /**
   * GET /topup/logs?page=1&limit=20
   * Response: { data: [...], pagination: { page, limit, total } }
   */
  router.get('/logs', async (c) => {
    const userId = c.get('userId') as string
    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)))

    const result = await getService().getUserLogs(userId, page, limit)
    return c.json(result)
  })

  return router
}

/**
 * topupWebhookRoute — no-auth Stripe webhook handler.
 * Mounted at POST /topup/webhook in index.ts BEFORE the JWT-protected group.
 */
export function topupWebhookRoute() {
  const router = new Hono()
  const getService = makeServiceGetter()

  router.post('/', async (c) => {
    const rawBody = await c.req.text()
    const sig = c.req.header('stripe-signature') ?? ''

    try {
      await getService().handleWebhookEvent(rawBody, sig)
      return c.json({ received: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      // Stripe signature errors contain "No signatures found" or "timestamp"
      if (
        msg.includes('signature') ||
        msg.includes('No signatures') ||
        msg.includes('timestamp')
      ) {
        return Errors.invalidSignature()
      }
      return Errors.internalError()
    }
  })

  return router
}
