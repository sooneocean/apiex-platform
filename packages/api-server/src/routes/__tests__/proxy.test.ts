import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

const {
  mockSupabaseFrom,
  mockResolveRoute,
  mockForward,
  mockGetAdapter,
  mockListActiveModels,
  mockReserveQuota,
  mockSettleQuota,
  mockLogUsage,
} = vi.hoisted(() => ({
  mockSupabaseFrom: vi.fn(),
  mockResolveRoute: vi.fn(),
  mockForward: vi.fn(),
  mockGetAdapter: vi.fn(),
  mockListActiveModels: vi.fn(),
  mockReserveQuota: vi.fn(),
  mockSettleQuota: vi.fn(),
  mockLogUsage: vi.fn(),
}))

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}))

// Mock supabaseAdmin
vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: { from: mockSupabaseFrom, rpc: vi.fn() },
  supabaseClient: {},
}))

// Mock services
vi.mock('../../services/RouterService.js', () => ({
  RouterService: vi.fn().mockImplementation(() => ({
    resolveRoute: mockResolveRoute,
    forward: mockForward,
    getAdapter: mockGetAdapter,
    listActiveModels: mockListActiveModels,
  })),
}))

vi.mock('../../services/KeyService.js', () => ({
  KeyService: vi.fn().mockImplementation(() => ({
    reserveQuota: mockReserveQuota,
    settleQuota: mockSettleQuota,
  })),
}))

vi.mock('../../services/UsageLogger.js', () => ({
  UsageLogger: vi.fn().mockImplementation(() => ({
    logUsage: mockLogUsage,
  })),
}))

import { proxyRoutes } from '../proxy.js'
import { InvalidRequestError, ServerError, ApiError } from '../../lib/errors.js'

function createTestApp() {
  const app = new Hono()
  // Simulate apiKeyAuth by setting context variables
  app.use('*', async (c, next) => {
    c.set('apiKeyId', 'key-123')
    c.set('userId', 'user-abc')
    c.set('apiKey', { id: 'key-123', user_id: 'user-abc', quota_tokens: 100000 })
    await next()
  })
  // Error handler
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return err.toResponse()
    }
    return c.json({ error: { message: err.message, type: 'server_error', code: 'internal_error' } }, 500)
  })
  app.route('/v1', proxyRoutes())
  return app
}

describe('Proxy Routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    vi.clearAllMocks()
    mockLogUsage.mockResolvedValue(undefined)
    app = createTestApp()
  })

  // ────────────────────────────────────────────────────────────────
  // TC-1: POST /v1/chat/completions — non-streaming proxy
  // ────────────────────────────────────────────────────────────────
  describe('POST /v1/chat/completions', () => {
    it('should proxy non-streaming request and return OpenAI format', async () => {
      const route = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })
      mockResolveRoute.mockResolvedValueOnce(route)

      const openAIResponse = {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1000,
        model: 'apex-smart',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }
      mockForward.mockResolvedValueOnce({ type: 'json', data: openAIResponse })
      mockSettleQuota.mockResolvedValueOnce(undefined)

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'apex-smart',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.object).toBe('chat.completion')
      expect(json.choices[0].message.content).toBe('Hello!')
    })

    // ────────────────────────────────────────────────────────────────
    // TC-2: 400 for unsupported model (validated BEFORE reserveQuota)
    // ────────────────────────────────────────────────────────────────
    it('should return 400 for unsupported model', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-totally-unsupported',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error.code).toBe('unsupported_model')
      // reserveQuota must NOT have been called for unsupported models
      expect(mockReserveQuota).not.toHaveBeenCalled()
    })

    // ────────────────────────────────────────────────────────────────
    // TC-3: 402 when quota exhausted (checked AFTER model validation)
    // ────────────────────────────────────────────────────────────────
    it('should return 402 when quota exhausted', async () => {
      mockReserveQuota.mockResolvedValueOnce({ success: false })

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'apex-smart',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })

      expect(res.status).toBe(402)
      const json = await res.json()
      expect(json.error.code).toBe('quota_exhausted')
      // resolveRoute must NOT have been called — fail fast before DB lookup
      expect(mockResolveRoute).not.toHaveBeenCalled()
    })

    // ────────────────────────────────────────────────────────────────
    // TC-4: 503 when route not configured (resolveRoute failure)
    // ────────────────────────────────────────────────────────────────
    it('should return 503 when route not configured', async () => {
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })
      mockResolveRoute.mockRejectedValueOnce(new InvalidRequestError("Model 'apex-smart' is not supported."))
      mockSettleQuota.mockResolvedValueOnce(undefined)

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'apex-smart',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })

      expect(res.status).toBe(503)
      const json = await res.json()
      expect(json.error.code).toBe('route_not_configured')
      // quota must be refunded
      expect(mockSettleQuota).toHaveBeenCalled()
    })

    // ────────────────────────────────────────────────────────────────
    // TC-5: settle quota and log usage on success
    // ────────────────────────────────────────────────────────────────
    it('should settle quota and log usage on success', async () => {
      const route = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })
      mockResolveRoute.mockResolvedValueOnce(route)

      const openAIResponse = {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1000,
        model: 'apex-smart',
        choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }
      mockForward.mockResolvedValueOnce({ type: 'json', data: openAIResponse })
      mockSettleQuota.mockResolvedValueOnce(undefined)

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'apex-smart',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 512,
        }),
      })

      expect(res.status).toBe(200)
      // Give fire-and-forget a tick
      await new Promise((r) => setTimeout(r, 20))
      expect(mockSettleQuota).toHaveBeenCalledWith('key-123', 512, 15)
      expect(mockLogUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyId: 'key-123',
          modelTag: 'apex-smart',
          status: 'success',
        })
      )
    })

    // ────────────────────────────────────────────────────────────────
    // TC-6: refund quota on upstream error
    // ────────────────────────────────────────────────────────────────
    it('should refund quota on upstream error', async () => {
      const route = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })
      mockResolveRoute.mockResolvedValueOnce(route)
      mockForward.mockRejectedValueOnce(new ServerError('Upstream failed', 'upstream_error'))
      mockSettleQuota.mockResolvedValueOnce(undefined)

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'apex-smart',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1024,
        }),
      })

      expect(res.status).toBeGreaterThanOrEqual(400)
      // Give fire-and-forget a tick
      await new Promise((r) => setTimeout(r, 20))
      // Full refund: settleQuota(keyId, reserved, 0) — actual=0 means full refund
      expect(mockSettleQuota).toHaveBeenCalledWith('key-123', 1024, 0)
      expect(mockLogUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
        })
      )
    })
  })

  // ────────────────────────────────────────────────────────────────
  // TC-7: GET /v1/models
  // ────────────────────────────────────────────────────────────────
  describe('GET /v1/models', () => {
    it('should return list of available models', async () => {
      mockListActiveModels.mockResolvedValueOnce([
        { id: 'apex-smart', object: 'model', created: 1000, owned_by: 'apiex' },
        { id: 'apex-cheap', object: 'model', created: 1000, owned_by: 'apiex' },
      ])

      const res = await app.request('/v1/models', { method: 'GET' })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.object).toBe('list')
      expect(json.data).toHaveLength(2)
      expect(json.data[0].id).toBe('apex-smart')
    })
  })

  // ────────────────────────────────────────────────────────────────
  // TC-8: GET /v1/usage/summary
  // ────────────────────────────────────────────────────────────────
  describe('GET /v1/usage/summary', () => {
    it('should return usage stats for authenticated user', async () => {
      const usageChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          ],
          error: null,
        }),
      }
      mockSupabaseFrom.mockReturnValueOnce(usageChain)

      const res = await app.request('/v1/usage/summary', { method: 'GET' })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.total_requests).toBe(2)
      expect(json.total_tokens).toBe(45)
    })
  })
})
