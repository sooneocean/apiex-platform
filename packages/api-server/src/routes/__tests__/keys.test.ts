/**
 * T11 TDD — Keys Route 測試
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// --- Mocks ---

const mockCreateKey = vi.fn()
const mockListKeys = vi.fn()
const mockRevokeKey = vi.fn()
const mockUpdateSpendLimit = vi.fn()
const mockResetSpend = vi.fn()

vi.mock('../../services/KeyService.js', () => {
  return {
    KeyService: class {
      createKey(...args: unknown[]) { return mockCreateKey(...args) }
      listKeys(...args: unknown[]) { return mockListKeys(...args) }
      revokeKey(...args: unknown[]) { return mockRevokeKey(...args) }
      updateSpendLimit(...args: unknown[]) { return mockUpdateSpendLimit(...args) }
      resetSpend(...args: unknown[]) { return mockResetSpend(...args) }
    },
  }
})

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

const { keysRoutes, _resetRateLimiter } = await import('../keys.js')

/**
 * Helper: create app with fake auth middleware injecting userId.
 * index.ts already applies supabaseJwtAuth on the /keys route group,
 * so keysRoutes() should NOT apply it again internally.
 */
function createTestApp(userId = 'user-uuid-test') {
  const app = new Hono()
  app.use('/keys/*', async (c, next) => {
    c.set('userId', userId)
    c.set('user', { id: userId, email: 'test@example.com' })
    await next()
  })
  app.route('/keys', keysRoutes())
  return app
}

describe('Keys Route — T11', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    _resetRateLimiter()
    app = createTestApp()
  })

  describe('GET /keys', () => {
    it('should_listKeys_whenAuthenticated', async () => {
      mockListKeys.mockResolvedValue([
        {
          id: 'key-1',
          prefix: 'apx-sk-ab',
          name: 'my-agent',
          status: 'active',
          quota_tokens: 50000,
          spend_limit_usd: -1,
          spent_usd: 0,
          created_at: '2026-03-14T00:00:00Z',
        },
      ])

      const res = await app.request('/keys')

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].key_prefix).toBe('apx-sk-ab')
      expect(body.data[0].spend_limit_usd).toBe(-1)
      expect(body.data[0].spent_usd).toBe(0)
      expect(body.data[0]).not.toHaveProperty('key_hash')
      expect(mockListKeys).toHaveBeenCalledWith('user-uuid-test')
    })
  })

  describe('POST /keys', () => {
    it('should_createKey_andReturnPlaintext', async () => {
      mockCreateKey.mockResolvedValue({
        id: 'key-new',
        key: 'apx-sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678',
        prefix: 'apx-sk-aB',
        name: 'my-new-key',
        status: 'active',
        quota_tokens: -1,
        spend_limit_usd: -1,
        spent_usd: 0,
        created_at: '2026-03-14T00:00:00Z',
      })

      const res = await app.request('/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-new-key' }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.key).toMatch(/^apx-sk-/)
      expect(body.data.key_prefix).toBe('apx-sk-aB')
      expect(body.data.name).toBe('my-new-key')
      expect(body.data.spend_limit_usd).toBe(-1)
      expect(body.data.spent_usd).toBe(0)
      expect(body.warning).toBeDefined()
      expect(mockCreateKey).toHaveBeenCalledWith('user-uuid-test', 'my-new-key', -1, null)
    })

    it('should_createKey_withSpendLimit', async () => {
      mockCreateKey.mockResolvedValue({
        id: 'key-with-limit',
        key: 'apx-sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345679',
        prefix: 'apx-sk-aB',
        name: 'limited-key',
        status: 'active',
        quota_tokens: -1,
        spend_limit_usd: 5000,
        spent_usd: 0,
        created_at: '2026-03-14T00:00:00Z',
      })

      const res = await app.request('/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'limited-key', spend_limit_usd: 5000 }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.spend_limit_usd).toBe(5000)
      expect(mockCreateKey).toHaveBeenCalledWith('user-uuid-test', 'limited-key', 5000, null)
    })

    it('should_createKey_withExpiresAt', async () => {
      const expiresAt = '2030-12-31T23:59:59Z'
      mockCreateKey.mockResolvedValue({
        id: 'key-expiry',
        key: 'apx-sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345680',
        prefix: 'apx-sk-aB',
        name: 'expiry-key',
        status: 'active',
        quota_tokens: -1,
        spend_limit_usd: -1,
        spent_usd: 0,
        created_at: '2026-03-14T00:00:00Z',
        expires_at: expiresAt,
      })

      const res = await app.request('/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'expiry-key', expires_at: expiresAt }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.expires_at).toBe(expiresAt)
      expect(mockCreateKey).toHaveBeenCalledWith('user-uuid-test', 'expiry-key', -1, expiresAt)
    })

    it('should_createKey_withNullExpiresAt_backward_compat', async () => {
      mockCreateKey.mockResolvedValue({
        id: 'key-noexpiry',
        key: 'apx-sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345681',
        prefix: 'apx-sk-aB',
        name: 'no-expiry-key',
        status: 'active',
        quota_tokens: -1,
        spend_limit_usd: -1,
        spent_usd: 0,
        created_at: '2026-03-14T00:00:00Z',
        expires_at: null,
      })

      const res = await app.request('/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'no-expiry-key' }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.expires_at).toBeNull()
      expect(mockCreateKey).toHaveBeenCalledWith('user-uuid-test', 'no-expiry-key', -1, null)
    })

    it('should_return400_whenExpiresAtIsInvalid', async () => {
      const res = await app.request('/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'bad-expiry', expires_at: 'not-a-date' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_parameter')
    })

    it('should_return400_whenInvalidSpendLimit', async () => {
      const res = await app.request('/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'bad-key', spend_limit_usd: -5 }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_parameter')
    })

    it('should_return429_whenRateLimited', async () => {
      mockCreateKey.mockResolvedValue({
        id: 'key-1',
        key: 'apx-sk-first',
        prefix: 'apx-sk-fi',
        name: 'First',
        status: 'active',
        quota_tokens: -1,
        created_at: '2026-03-14T00:00:00Z',
      })

      // First request succeeds
      const res1 = await app.request('/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'First' }),
      })
      expect(res1.status).toBe(201)

      // Second request within 1s → rate limited
      const res2 = await app.request('/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Second' }),
      })
      expect(res2.status).toBe(429)
    })
  })

  describe('DELETE /keys/:id', () => {
    it('should_revokeKey_whenOwner', async () => {
      mockRevokeKey.mockResolvedValue(undefined)

      const res = await app.request('/keys/key-1', { method: 'DELETE' })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.id).toBe('key-1')
      expect(body.data.status).toBe('revoked')
      expect(body.data.revoked_at).toBeDefined()
      expect(mockRevokeKey).toHaveBeenCalledWith('user-uuid-test', 'key-1')
    })

    it('should_return404_whenKeyNotFound', async () => {
      mockRevokeKey.mockRejectedValue(new Error('Failed to revoke API key: No rows found'))

      const res = await app.request('/keys/nonexistent', { method: 'DELETE' })

      expect(res.status).toBe(404)
    })
  })


  describe('PATCH /keys/:id', () => {
    it('should_updateSpendLimit_successfully', async () => {
      mockUpdateSpendLimit.mockResolvedValue(undefined)

      const res = await app.request('/keys/key-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_limit_usd: 1000 }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.id).toBe('key-1')
      expect(body.data.spend_limit_usd).toBe(1000)
      expect(mockUpdateSpendLimit).toHaveBeenCalledWith('user-uuid-test', 'key-1', 1000)
    })

    it('should_return400_whenSpendLimitInvalid', async () => {
      const res = await app.request('/keys/key-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_limit_usd: -5 }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_parameter')
    })

    it('should_return400_whenSpendLimitMissing', async () => {
      const res = await app.request('/keys/key-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
    })

    it('should_return404_whenKeyNotFound', async () => {
      mockUpdateSpendLimit.mockRejectedValue(new Error('Failed to update spend limit'))

      const res = await app.request('/keys/key-999', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_limit_usd: 500 }),
      })

      expect(res.status).toBe(404)
    })

    it('should_allow_spendLimit_zero_fullBlock', async () => {
      mockUpdateSpendLimit.mockResolvedValue(undefined)

      const res = await app.request('/keys/key-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_limit_usd: 0 }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.spend_limit_usd).toBe(0)
    })

    it('should_allow_spendLimit_negative_one_unlimited', async () => {
      mockUpdateSpendLimit.mockResolvedValue(undefined)

      const res = await app.request('/keys/key-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_limit_usd: -1 }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.spend_limit_usd).toBe(-1)
    })
  })

  describe('POST /keys/:id/reset-spend', () => {
    it('should_resetSpend_whenKeyOwnedByUser', async () => {
      mockListKeys.mockResolvedValue([
        {
          id: 'key-1',
          prefix: 'apx-sk-ab',
          name: 'my-key',
          status: 'active',
          quota_tokens: -1,
          spend_limit_usd: 5000,
          spent_usd: 3000,
          created_at: '2026-03-14T00:00:00Z',
        },
      ])
      mockResetSpend.mockResolvedValue(undefined)

      const res = await app.request('/keys/key-1/reset-spend', {
        method: 'POST',
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.id).toBe('key-1')
      expect(body.data.spent_usd).toBe(0)
      expect(body.data.spend_limit_usd).toBe(5000)
      expect(body.data.message).toBeDefined()
      expect(mockResetSpend).toHaveBeenCalledWith('key-1')
    })

    it('should_return404_whenKeyNotOwnedByUser', async () => {
      mockListKeys.mockResolvedValue([]) // User owns no keys

      const res = await app.request('/keys/key-999/reset-spend', {
        method: 'POST',
      })

      expect(res.status).toBe(404)
      expect(mockResetSpend).not.toHaveBeenCalled()
    })
  })
})
