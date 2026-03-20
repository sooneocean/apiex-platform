import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { apiKeyAuth, setApiKeyLookup, type ApiKeyLookupFn } from '../apiKeyAuth.js'

function createTestApp(lookupFn: ApiKeyLookupFn) {
  setApiKeyLookup(lookupFn)
  const app = new Hono()
  app.use('*', apiKeyAuth)
  app.get('/test', (c) => c.json({ userId: c.get('userId'), apiKeyId: c.get('apiKeyId'), tier: c.get('apiKeyTier') }))
  return app
}

describe('apiKeyAuth middleware', () => {
  const validKeyData = {
    id: 'key-1',
    user_id: 'user-1',
    rate_limit_tier: 'pro',
    expires_at: null,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should reject requests without Authorization header', async () => {
    const app = createTestApp(vi.fn())
    const res = await app.request('/test')
    expect(res.status).toBe(401)
  })

  it('should reject requests with non-Bearer auth', async () => {
    const app = createTestApp(vi.fn())
    const res = await app.request('/test', { headers: { Authorization: 'Basic abc' } })
    expect(res.status).toBe(401)
  })

  it('should reject keys without apx-sk- prefix', async () => {
    const app = createTestApp(vi.fn())
    const res = await app.request('/test', { headers: { Authorization: 'Bearer wrong-prefix-key' } })
    expect(res.status).toBe(401)
  })

  it('should reject keys not found in database', async () => {
    const lookup = vi.fn().mockResolvedValue({ data: null, error: null })
    const app = createTestApp(lookup)
    const res = await app.request('/test', { headers: { Authorization: 'Bearer apx-sk-testkey123' } })
    expect(res.status).toBe(401)
    expect(lookup).toHaveBeenCalledOnce()
  })

  it('should reject expired keys', async () => {
    const lookup = vi.fn().mockResolvedValue({
      data: { ...validKeyData, expires_at: '2020-01-01T00:00:00Z' },
      error: null,
    })
    const app = createTestApp(lookup)
    const res = await app.request('/test', { headers: { Authorization: 'Bearer apx-sk-testkey123' } })
    expect(res.status).toBe(401)
  })

  it('should pass valid keys and set context', async () => {
    const lookup = vi.fn().mockResolvedValue({ data: validKeyData, error: null })
    const app = createTestApp(lookup)
    const res = await app.request('/test', { headers: { Authorization: 'Bearer apx-sk-testkey123' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userId).toBe('user-1')
    expect(body.apiKeyId).toBe('key-1')
    expect(body.tier).toBe('pro')
  })

  it('should default tier to free when not specified', async () => {
    const lookup = vi.fn().mockResolvedValue({
      data: { ...validKeyData, rate_limit_tier: null },
      error: null,
    })
    const app = createTestApp(lookup)
    const res = await app.request('/test', { headers: { Authorization: 'Bearer apx-sk-testkey123' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tier).toBe('free')
  })
})
