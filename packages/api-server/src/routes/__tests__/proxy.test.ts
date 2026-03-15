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
  mockCheckSpendLimit,
  mockRecordSpend,
  mockGetEffectiveRate,
} = vi.hoisted(() => ({
  mockSupabaseFrom: vi.fn(),
  mockResolveRoute: vi.fn(),
  mockForward: vi.fn(),
  mockGetAdapter: vi.fn(),
  mockListActiveModels: vi.fn(),
  mockReserveQuota: vi.fn(),
  mockSettleQuota: vi.fn(),
  mockLogUsage: vi.fn(),
  mockCheckSpendLimit: vi.fn(),
  mockRecordSpend: vi.fn(),
  mockGetEffectiveRate: vi.fn(),
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
  RouterService: class {
    resolveRoute = mockResolveRoute
    forward = mockForward
    getAdapter = mockGetAdapter
    listActiveModels = mockListActiveModels
  },
}))

vi.mock('../../services/KeyService.js', () => ({
  KeyService: class {
    reserveQuota = mockReserveQuota
    settleQuota = mockSettleQuota
    checkSpendLimit = mockCheckSpendLimit
    recordSpend = mockRecordSpend
  },
}))

vi.mock('../../services/RatesService.js', () => ({
  RatesService: class {
    getEffectiveRate = mockGetEffectiveRate
  },
}))

vi.mock('../../services/UsageLogger.js', () => ({
  UsageLogger: class {
    logUsage = mockLogUsage
  },
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
    mockCheckSpendLimit.mockResolvedValue(true)  // default: within limit
    mockRecordSpend.mockResolvedValue(undefined)
    mockGetEffectiveRate.mockResolvedValue(null)  // default: no rate (cost = 0)
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
  // TC-9: spend limit exceeded → 402 spend_limit_exceeded
  // ────────────────────────────────────────────────────────────────
  describe('spend limit', () => {
    it('should return 402 with spend_limit_exceeded when limit reached', async () => {
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })
      // Spend limit exceeded
      mockCheckSpendLimit.mockResolvedValueOnce(false)
      mockSettleQuota.mockResolvedValueOnce(undefined)

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
      expect(json.error.code).toBe('spend_limit_exceeded')
      // resolveRoute must NOT have been called
      expect(mockResolveRoute).not.toHaveBeenCalled()
      // Quota must be refunded
      await new Promise((r) => setTimeout(r, 20))
      expect(mockSettleQuota).toHaveBeenCalled()
    })

    it('should record spend after successful non-streaming request', async () => {
      const route = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })
      mockCheckSpendLimit.mockResolvedValueOnce(true)
      mockResolveRoute.mockResolvedValueOnce(route)

      const openAIResponse = {
        id: 'chatcmpl-2',
        object: 'chat.completion',
        created: 1000,
        model: 'apex-smart',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }
      mockForward.mockResolvedValueOnce({ type: 'json', data: openAIResponse })
      mockSettleQuota.mockResolvedValueOnce(undefined)

      // Rate: input 0.01 per 1k, output 0.03 per 1k
      // Cost = (100/1000)*0.01*100 + (50/1000)*0.03*100 = 0.1 + 0.15 = 0.25 cents → Math.round = 0
      // Use larger values to get non-zero cost
      mockGetEffectiveRate.mockResolvedValueOnce({
        model_tag: 'apex-smart',
        input_rate_per_1k: 10,    // $10 per 1k tokens
        output_rate_per_1k: 30,   // $30 per 1k tokens
        effective_from: '2026-01-01',
      })

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'apex-smart',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })

      expect(res.status).toBe(200)
      // Give fire-and-forget a tick
      await new Promise((r) => setTimeout(r, 30))

      // cost = (100/1000)*10*100 + (50/1000)*30*100 = 100 + 150 = 250 cents
      expect(mockRecordSpend).toHaveBeenCalledWith('key-123', 250)
    })

    it('should NOT record spend when no rate is configured', async () => {
      const route = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })
      mockCheckSpendLimit.mockResolvedValueOnce(true)
      mockResolveRoute.mockResolvedValueOnce(route)

      const openAIResponse = {
        id: 'chatcmpl-3',
        object: 'chat.completion',
        created: 1000,
        model: 'apex-smart',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }
      mockForward.mockResolvedValueOnce({ type: 'json', data: openAIResponse })
      mockSettleQuota.mockResolvedValueOnce(undefined)
      mockGetEffectiveRate.mockResolvedValueOnce(null)  // No rate configured

      await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'apex-smart', messages: [{ role: 'user', content: 'hi' }] }),
      })

      await new Promise((r) => setTimeout(r, 30))
      // recordSpend must NOT be called when rate is null (E2 exception case)
      expect(mockRecordSpend).not.toHaveBeenCalled()
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
      // First supabase call: usage_logs query (select → eq → resolves)
      const usageChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            { model_tag: 'apex-smart', prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            { model_tag: 'apex-cheap', prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          ],
          error: null,
        }),
      }
      // Second supabase call: api_keys quota query (select → eq → single → resolves)
      const keyChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { quota_tokens: 50000 },
          error: null,
        }),
      }
      mockSupabaseFrom.mockReturnValueOnce(usageChain)
      mockSupabaseFrom.mockReturnValueOnce(keyChain)

      const res = await app.request('/v1/usage/summary', { method: 'GET' })

      expect(res.status).toBe(200)
      const json = await res.json()
      // Response is wrapped in data: { ... }
      expect(json.data.total_requests).toBe(2)
      expect(json.data.total_tokens).toBe(45)
      expect(json.data.quota_remaining).toBe(50000)
    })
  })
})
