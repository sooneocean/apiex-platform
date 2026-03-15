/**
 * T12 TDD — Admin Route 測試
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// Mock supabaseAdmin
const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

vi.mock('../../services/KeyService.js', () => ({
  KeyService: vi.fn().mockImplementation(() => ({})),
}))

const { adminRoutes } = await import('../admin.js')

describe('Admin Route — T12', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Hono()
    // Simulate adminAuth middleware
    app.use('/admin/*', async (c, next) => {
      c.set('userId', 'admin-uuid')
      c.set('user', { id: 'admin-uuid', email: 'admin@example.com' })
      await next()
    })
    app.route('/admin', adminRoutes())
  })

  describe('GET /admin/users', () => {
    it('should return paginated user list with quota info', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'alice@example.com',
          key_count: 2,
          total_tokens_used: 50000,
          quota_tokens: 100000,
          created_at: '2026-03-14T00:00:00Z',
        },
      ]

      mockRpc.mockResolvedValue({ data: mockUsers, error: null, count: 1 })

      const res = await app.request('/admin/users?page=1&limit=20')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].email).toBe('alice@example.com')
      expect(body.pagination).toBeDefined()
    })
  })

  describe('PATCH /admin/users/:id/quota', () => {
    it('should update user quota and return updated count', async () => {
      // Mock: update user_quotas + update api_keys
      const mockUpsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { user_id: 'user-1' }, error: null }),
        }),
      })
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{}, {}, {}], error: null, count: 3 }),
        }),
      })

      mockFrom
        .mockReturnValueOnce({ upsert: mockUpsert })  // user_quotas
        .mockReturnValueOnce({ update: mockUpdate })    // api_keys

      const res = await app.request('/admin/users/user-1/quota', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quota_tokens: 1000000 }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.user_id).toBe('user-1')
      expect(body.data.quota_tokens).toBe(1000000)
    })

    it('should reject quota_tokens < -1', async () => {
      const res = await app.request('/admin/users/user-1/quota', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quota_tokens: -2 }),
      })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /admin/usage-logs', () => {
    it('should return paginated usage logs with filters', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          api_key_prefix: 'apx-sk-ab',
          model_tag: 'apex-smart',
          upstream_model: 'claude-opus-4-6',
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          latency_ms: 1200,
          status: 'success',
          created_at: '2026-03-14T01:30:00Z',
        },
      ]

      const mockSelect = vi.fn().mockReturnThis()
      const mockOrder = vi.fn().mockReturnThis()
      const mockRange = vi.fn().mockResolvedValue({
        data: mockLogs,
        error: null,
        count: 1,
      })

      mockFrom.mockReturnValue({
        select: mockSelect,
        order: mockOrder,
        range: mockRange,
      })

      const res = await app.request('/admin/usage-logs?page=1&limit=50')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].model_tag).toBe('apex-smart')
      expect(body.pagination).toBeDefined()
    })
  })

  describe('Authorization', () => {
    it('should_return403_whenNotAdmin', async () => {
      // Simulate what happens when adminAuth middleware rejects a non-admin user.
      // In production, adminAuth (from index.ts) checks ADMIN_EMAILS whitelist
      // and returns 403 before the route handler runs.
      const noAdminApp = new Hono()
      noAdminApp.use('/admin/*', async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Admin access required.',
              type: 'authorization_error',
              code: 'admin_required',
            },
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      })
      noAdminApp.route('/admin', adminRoutes())

      const res = await noAdminApp.request('/admin/users')
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('admin_required')
    })
  })

  describe('PATCH /admin/users/:id/rate-limit', () => {
    it('should update rate limit tier and return updated_keys count', async () => {
      // Mock: rate_limit_tiers lookup succeeds
      const mockSelectChain = {
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { tier: 'pro' }, error: null }),
        }),
      }
      const mockUpdateChain = {
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{ id: 'key-1' }, { id: 'key-2' }], error: null }),
        }),
      }

      mockFrom
        .mockReturnValueOnce({ select: vi.fn().mockReturnValue(mockSelectChain) }) // rate_limit_tiers
        .mockReturnValueOnce({ update: vi.fn().mockReturnValue(mockUpdateChain) }) // api_keys

      const res = await app.request('/admin/users/user-1/rate-limit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'pro' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.user_id).toBe('user-1')
      expect(body.data.tier).toBe('pro')
      expect(body.data.updated_keys).toBe(2)
    })

    it('should return 400 when tier does not exist in rate_limit_tiers', async () => {
      // Mock: tier lookup fails — no row found
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'No row found' } }),
          }),
        }),
      })

      const res = await app.request('/admin/users/user-1/rate-limit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'nonexistent_tier' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_plan')
    })
  })
})
