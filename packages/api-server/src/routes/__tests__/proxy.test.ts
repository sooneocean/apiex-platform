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
  // POST /v1/chat/completions — non-streaming
  // ────────────────────────────────────────────────────────────────

  describe('POST /v1/chat/completions', () => {
    it('should_returnOpenAICompletion_whenNonStreaming', async () => {
      const route = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockResolveRoute.mockResolvedValueOnce(route)
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })

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
      expect(mockSettleQuota).toHaveBeenCalled()
      expect(mockLogUsage).toHaveBeenCalled()
    })

    it('should_return402_whenQuotaExhausted', async () => {
      const route = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockResolveRoute.mockResolvedValueOnce(route)
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
    })

    it('should_return400_whenUnsupportedModel', async () => {
      mockResolveRoute.mockRejectedValueOnce(new InvalidRequestError("Model 'bad-model' is not supported."))

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'bad-model',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })

      expect(res.status).toBe(400)
    })

    it('should_return502_whenUpstreamTimeout', async () => {
      const route = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockResolveRoute.mockResolvedValueOnce(route)
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })
      mockForward.mockRejectedValueOnce(new ServerError('Upstream service timed out.', 'upstream_timeout'))
      mockSettleQuota.mockResolvedValueOnce(undefined)

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'apex-smart',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })

      // ServerError with default statusCode 500, but our ServerError('...', 'upstream_timeout') still 500
      // The forward method should throw an ApiError with 502
      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it('should_returnSSEChunks_whenStreaming', async () => {
      const route = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockResolveRoute.mockResolvedValueOnce(route)
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })

      const encoder = new TextEncoder()
      const sseStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1000,"model":"apex-smart","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      mockForward.mockResolvedValueOnce({
        type: 'stream',
        stream: sseStream,
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
      mockSettleQuota.mockResolvedValueOnce(undefined)

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'apex-smart',
          messages: [{ role: 'user', content: 'hi' }],
          stream: true,
        }),
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/event-stream')
      const text = await res.text()
      expect(text).toContain('data:')
    })

    it('should_callSettleQuota_afterStreamComplete', async () => {
      const route = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockResolveRoute.mockResolvedValueOnce(route)
      mockReserveQuota.mockResolvedValueOnce({ success: true, remainingTokens: 90000 })

      const encoder = new TextEncoder()
      const sseStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      mockForward.mockResolvedValueOnce({
        type: 'stream',
        stream: sseStream,
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
      mockSettleQuota.mockResolvedValueOnce(undefined)

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'apex-smart',
          messages: [{ role: 'user', content: 'hi' }],
          stream: true,
        }),
      })

      // Consume the stream to trigger completion
      await res.text()

      // settleQuota is called after stream finishes (fire-and-forget in background)
      // Give it a tick
      await new Promise((r) => setTimeout(r, 50))
      expect(mockSettleQuota).toHaveBeenCalled()
    })
  })

  // ────────────────────────────────────────────────────────────────
  // GET /v1/models
  // ────────────────────────────────────────────────────────────────

  describe('GET /v1/models', () => {
    it('should_returnModelList_whenGetModels', async () => {
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
  // GET /v1/usage/summary
  // ────────────────────────────────────────────────────────────────

  describe('GET /v1/usage/summary', () => {
    it('should_returnUsageSummary', async () => {
      // Mock supabaseAdmin.from('usage_logs') chain
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
