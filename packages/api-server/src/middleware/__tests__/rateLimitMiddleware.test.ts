/**
 * T9 TDD — rateLimitMiddleware 測試
 * Mock RateLimiter，驗證 header 行為與 429 回應格式。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// ---------------------------------------------------------------------------
// Mock RateLimiter singleton
// ---------------------------------------------------------------------------

const mockCheck = vi.fn()

vi.mock('../../lib/RateLimiter.js', () => ({
  rateLimiter: {
    check: (...args: unknown[]) => mockCheck(...args),
  },
}))

// Import after mock
const { rateLimitMiddleware } = await import('../rateLimitMiddleware.js')
const { ApiError, Errors } = await import('../../lib/errors.js')

// ---------------------------------------------------------------------------
// Helper: build minimal Hono app with the middleware + global error handler
// ---------------------------------------------------------------------------

function buildApp(keyId = 'key-test', tier = 'free') {
  const app = new Hono()

  // Simulate upstream middleware that sets context values
  app.use('/*', async (c, next) => {
    c.set('apiKeyId', keyId)
    c.set('apiKeyTier', tier)
    await next()
  })

  app.use('/*', rateLimitMiddleware)

  // Simple downstream handler
  app.post('/v1/messages', (c) => c.json({ ok: true }))

  // Mirror the global error handler from index.ts
  app.onError((err) => {
    if (err instanceof ApiError) {
      return err.toResponse()
    }
    return Errors.internalError()
  })

  return app
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rateLimitMiddleware — T9', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Case 1: passes through and adds X-RateLimit-* headers when under limit
  it('passes through and attaches X-RateLimit-* headers when under limit', async () => {
    mockCheck.mockResolvedValue({
      allowed: true,
      limits: { rpm: 60, tpm: 500_000 },
      remaining: { rpm: 59, tpm: 495_904 },
    })

    const app = buildApp('key-1', 'pro')
    const res = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_tokens: 4096 }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit-Requests')).toBe('60')
    expect(res.headers.get('X-RateLimit-Limit-Tokens')).toBe('500000')
    expect(res.headers.get('X-RateLimit-Remaining-Requests')).toBe('59')
    expect(res.headers.get('X-RateLimit-Remaining-Tokens')).toBe('495904')
  })

  // Case 2: returns 429 when RPM exceeded, with Retry-After header
  it('returns 429 with Retry-After when RPM is exceeded', async () => {
    mockCheck.mockResolvedValue({
      allowed: false,
      limits: { rpm: 20, tpm: 100_000 },
      remaining: { rpm: 0, tpm: 96_000 },
      retryAfter: 42,
    })

    const app = buildApp('key-rpm', 'free')
    const res = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_tokens: 512 }),
    })

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')

    const body = await res.json()
    expect(body.error.code).toBe('rate_limit')
  })

  // Case 3: returns 429 when TPM exceeded, with Retry-After header
  it('returns 429 with Retry-After when TPM is exceeded', async () => {
    mockCheck.mockResolvedValue({
      allowed: false,
      limits: { rpm: 20, tpm: 100_000 },
      remaining: { rpm: 19, tpm: 0 },
      retryAfter: 17,
    })

    const app = buildApp('key-tpm', 'free')
    const res = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_tokens: 90_000 }),
    })

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('17')

    const body = await res.json()
    expect(body.error.type).toBe('rate_limit_error')
  })

  // Case 4: skips rate limit headers for unlimited tier (limits.rpm === -1)
  it('does not attach rate limit headers for unlimited tier', async () => {
    mockCheck.mockResolvedValue({
      allowed: true,
      limits: { rpm: -1, tpm: -1 },
      remaining: { rpm: -1, tpm: -1 },
    })

    const app = buildApp('key-unlimited', 'unlimited')
    const res = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_tokens: 99_999 }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit-Requests')).toBeNull()
    expect(res.headers.get('X-RateLimit-Limit-Tokens')).toBeNull()
    expect(res.headers.get('X-RateLimit-Remaining-Requests')).toBeNull()
    expect(res.headers.get('X-RateLimit-Remaining-Tokens')).toBeNull()
  })
})
