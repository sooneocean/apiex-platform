/**
 * T11 TDD — Keys Route 測試
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// --- Mocks ---

const mockCreateKey = vi.fn()
const mockListKeys = vi.fn()
const mockRevokeKey = vi.fn()

vi.mock('../../services/KeyService.js', () => {
  return {
    KeyService: class {
      createKey(...args: unknown[]) { return mockCreateKey(...args) }
      listKeys(...args: unknown[]) { return mockListKeys(...args) }
      revokeKey(...args: unknown[]) { return mockRevokeKey(...args) }
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
          created_at: '2026-03-14T00:00:00Z',
        },
      ])

      const res = await app.request('/keys')

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].key_prefix).toBe('apx-sk-ab')
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
      expect(body.warning).toBeDefined()
      expect(mockCreateKey).toHaveBeenCalledWith('user-uuid-test', 'my-new-key')
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
})
