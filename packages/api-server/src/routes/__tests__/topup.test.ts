/**
 * T04 TDD — Topup Routes 測試
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// --- Mocks ---

const mockCreateCheckoutSession = vi.fn()
const mockHandleWebhookEvent = vi.fn()
const mockGetTopupStatus = vi.fn()
const mockGetUserLogs = vi.fn()

vi.mock('../../services/TopupService.js', () => {
  return {
    TopupService: class {
      createCheckoutSession(...args: unknown[]) { return mockCreateCheckoutSession(...args) }
      handleWebhookEvent(...args: unknown[]) { return mockHandleWebhookEvent(...args) }
      getTopupStatus(...args: unknown[]) { return mockGetTopupStatus(...args) }
      getUserLogs(...args: unknown[]) { return mockGetUserLogs(...args) }
    },
  }
})

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

const { topupRoutes, topupWebhookRoute } = await import('../topup.js')

/**
 * Helper: create JWT-auth app with fake middleware injecting userId.
 */
function createTestApp(userId = 'user-uuid-test') {
  const app = new Hono()
  app.use('/topup/*', async (c, next) => {
    c.set('userId', userId)
    c.set('user', { id: userId, email: 'test@example.com' })
    await next()
  })
  app.route('/topup', topupRoutes())
  return app
}

/**
 * Helper: create webhook app (no auth middleware).
 */
function createWebhookApp() {
  const app = new Hono()
  app.route('/topup/webhook', topupWebhookRoute())
  return app
}

describe('Topup Routes — T04', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── POST /topup/checkout ─────────────────────────────────────────────────

  describe('POST /topup/checkout', () => {
    it('should_createCheckoutSession_andReturn200', async () => {
      mockCreateCheckoutSession.mockResolvedValue({
        checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_abc',
        session_id: 'cs_test_abc',
      })

      const app = createTestApp()
      const res = await app.request('/topup/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: 'plan_10' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.checkout_url).toBe('https://checkout.stripe.com/c/pay/cs_test_abc')
      expect(body.data.session_id).toBe('cs_test_abc')
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith('user-uuid-test', 'plan_10')
    })

    it('should_return400_whenInvalidPlan', async () => {
      mockCreateCheckoutSession.mockRejectedValue(
        new Error('Invalid plan: plan_999. Valid values: plan_5, plan_10, plan_20.')
      )

      const app = createTestApp()
      const res = await app.request('/topup/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: 'plan_999' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_plan')
    })
  })

  // ─── POST /topup/webhook ─────────────────────────────────────────────────

  describe('POST /topup/webhook', () => {
    it('should_handleWebhook_andReturnReceived', async () => {
      mockHandleWebhookEvent.mockResolvedValue(undefined)

      const app = createWebhookApp()
      const res = await app.request('/topup/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=1710400000,v1=abc123',
        },
        body: JSON.stringify({ type: 'checkout.session.completed' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.received).toBe(true)
      expect(mockHandleWebhookEvent).toHaveBeenCalledWith(
        JSON.stringify({ type: 'checkout.session.completed' }),
        't=1710400000,v1=abc123'
      )
    })

    it('should_return400_whenSignatureInvalid', async () => {
      mockHandleWebhookEvent.mockRejectedValue(new Error('No signatures found matching the expected signature'))

      const app = createWebhookApp()
      const res = await app.request('/topup/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'bad-signature',
        },
        body: JSON.stringify({ type: 'checkout.session.completed' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_signature')
    })
  })

  // ─── GET /topup/status ───────────────────────────────────────────────────

  describe('GET /topup/status', () => {
    it('should_returnCompleted_whenSessionExists', async () => {
      mockGetTopupStatus.mockResolvedValue({
        status: 'completed',
        tokens_granted: 1_000_000,
        completed_at: '2026-03-15T03:00:00Z',
      })

      const app = createTestApp()
      const res = await app.request('/topup/status?session_id=cs_test_abc')

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.status).toBe('completed')
      expect(body.data.tokens_granted).toBe(1_000_000)
      expect(body.data.completed_at).toBe('2026-03-15T03:00:00Z')
      expect(mockGetTopupStatus).toHaveBeenCalledWith('cs_test_abc')
    })

    it('should_returnPending_whenSessionNotFound', async () => {
      mockGetTopupStatus.mockResolvedValue({ status: 'pending' })

      const app = createTestApp()
      const res = await app.request('/topup/status?session_id=cs_test_xyz')

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.status).toBe('pending')
      expect(mockGetTopupStatus).toHaveBeenCalledWith('cs_test_xyz')
    })

    it('should_return400_whenSessionIdMissing', async () => {
      const app = createTestApp()
      const res = await app.request('/topup/status')

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('missing_session_id')
    })
  })

  // ─── GET /topup/logs ─────────────────────────────────────────────────────

  describe('GET /topup/logs', () => {
    it('should_returnPaginatedLogs', async () => {
      mockGetUserLogs.mockResolvedValue({
        data: [
          {
            id: 'log-1',
            amount_usd: 1000,
            tokens_granted: 1_000_000,
            status: 'completed',
            created_at: '2026-03-15T03:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 20, total: 1 },
      })

      const app = createTestApp()
      const res = await app.request('/topup/logs?page=1&limit=20')

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].id).toBe('log-1')
      expect(body.pagination.total).toBe(1)
      expect(mockGetUserLogs).toHaveBeenCalledWith('user-uuid-test', 1, 20)
    })
  })
})
