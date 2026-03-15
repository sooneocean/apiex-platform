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

const mockResetSpend = vi.fn()

vi.mock('../../services/KeyService.js', () => ({
  KeyService: vi.fn().mockImplementation(() => ({
    resetSpend: (...args: unknown[]) => mockResetSpend(...args),
  })),
}))

// Helper: build a full Supabase chain stub ending in a resolved value
function makeSupabaseChain(resolvedValue: unknown) {
  const terminal = {
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(resolvedValue),
    order: vi.fn(),
    eq: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    range: vi.fn(),
  }
  // Make every chainable method return terminal so any chain works
  Object.keys(terminal).forEach((k) => {
    if (k !== 'single') {
      (terminal as Record<string, unknown>)[k] = vi.fn().mockReturnValue(terminal)
    }
  })
  // Make the chain thenable (for queries that don't end with .single())
  ;(terminal as { then: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve)
  return terminal
}

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

  // ---------------------------------------------------------------------------
  // Models (route_config) endpoints — T6
  // ---------------------------------------------------------------------------

  describe('GET /admin/models', () => {
    it('should return all route_config records including inactive', async () => {
      const mockModels = [
        {
          id: 'rc-1',
          tag: 'apex-cheap',
          upstream_provider: 'google',
          upstream_model: 'gemini-2.0-flash',
          upstream_base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
          is_active: true,
          updated_at: '2026-03-15T00:00:00Z',
        },
        {
          id: 'rc-2',
          tag: 'apex-smart',
          upstream_provider: 'anthropic',
          upstream_model: 'claude-opus-4-6',
          upstream_base_url: 'https://api.anthropic.com',
          is_active: false,
          updated_at: '2026-03-14T00:00:00Z',
        },
      ]

      const chain = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      }
      // Second order() call resolves
      chain.order = vi.fn()
        .mockReturnValueOnce(chain)
        .mockResolvedValueOnce({ data: mockModels, error: null })

      mockFrom.mockReturnValueOnce(chain)

      const res = await app.request('/admin/models')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(2)
      expect(body.data[0].tag).toBe('apex-cheap')
    })
  })

  describe('POST /admin/models', () => {
    it('should create a new route_config and return 201', async () => {
      const newModel = {
        id: 'rc-new',
        tag: 'apex-test',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-3-5-haiku',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
        updated_at: '2026-03-15T10:00:00Z',
      }

      const insertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: newModel, error: null }),
      }
      mockFrom.mockReturnValueOnce(insertChain)

      const res = await app.request('/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: 'apex-test',
          upstream_provider: 'anthropic',
          upstream_model: 'claude-3-5-haiku',
          upstream_base_url: 'https://api.anthropic.com',
        }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.tag).toBe('apex-test')
      expect(body.data.id).toBe('rc-new')
    })

    it('should return 409 when tag already exists as active route', async () => {
      const insertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        }),
      }
      mockFrom.mockReturnValueOnce(insertChain)

      const res = await app.request('/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: 'apex-smart',
          upstream_provider: 'anthropic',
          upstream_model: 'claude-opus-4-6',
          upstream_base_url: 'https://api.anthropic.com',
        }),
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('conflict')
    })

    it('should return 400 when required fields are missing', async () => {
      const res = await app.request('/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'apex-test' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_parameter')
    })
  })

  describe('PATCH /admin/models/:id', () => {
    it('should update an existing route_config and return 200', async () => {
      const updatedModel = {
        id: 'rc-1',
        tag: 'apex-smart',
        upstream_provider: 'google',
        upstream_model: 'gemini-2.0-flash',
        upstream_base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        is_active: true,
        updated_at: '2026-03-15T12:00:00Z',
      }

      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedModel, error: null }),
      }
      mockFrom.mockReturnValueOnce(updateChain)

      const res = await app.request('/admin/models/rc-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upstream_provider: 'google' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.upstream_provider).toBe('google')
    })

    it('should return 404 when route_config record does not exist', async () => {
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
        }),
      }
      mockFrom.mockReturnValueOnce(updateChain)

      const res = await app.request('/admin/models/nonexistent-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.code).toBe('not_found')
    })

    it('should return 409 when update causes duplicate active tag', async () => {
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        }),
      }
      mockFrom.mockReturnValueOnce(updateChain)

      const res = await app.request('/admin/models/rc-2', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('conflict')
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

// =============================================================================
// FA-E — model-management route admin tests (T19 Red → Green)
// /admin/routes endpoints
// =============================================================================

describe('Admin Routes — FA-E /admin/routes CRUD', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Hono()
    app.use('/admin/*', async (c, next) => {
      c.set('userId', 'admin-uuid')
      c.set('user', { id: 'admin-uuid', email: 'admin@example.com' })
      await next()
    })
    app.route('/admin', adminRoutes())
  })

  const mockRoute = {
    id: 'route-uuid-1',
    tag: 'apex-smart',
    upstream_provider: 'anthropic',
    upstream_model: 'claude-opus-4-6',
    upstream_base_url: 'https://api.anthropic.com',
    is_active: true,
    updated_at: '2026-03-15T00:00:00Z',
  }

  // ─── GET /admin/routes ───────────────────────────────────────────────────

  describe('GET /admin/routes', () => {
    it('should return list of all route_config records', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      }
      chain.order = vi.fn()
        .mockReturnValueOnce(chain)
        .mockResolvedValueOnce({ data: [mockRoute], error: null })
      mockFrom.mockReturnValueOnce(chain)

      const res = await app.request('/admin/routes')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.data)).toBe(true)
    })
  })

  // ─── POST /admin/routes ──────────────────────────────────────────────────

  describe('POST /admin/routes', () => {
    it('should create a new route and return 201', async () => {
      const insertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRoute, error: null }),
      }
      mockFrom.mockReturnValueOnce(insertChain)

      const res = await app.request('/admin/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: 'apex-smart',
          upstream_provider: 'anthropic',
          upstream_model: 'claude-opus-4-6',
          upstream_base_url: 'https://api.anthropic.com',
        }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data).toBeDefined()
    })

    it('should return 400 when required fields are missing', async () => {
      const res = await app.request('/admin/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'apex-smart' }),
      })

      expect(res.status).toBe(400)
    })
  })

  // ─── PATCH /admin/routes/:id ─────────────────────────────────────────────

  describe('PATCH /admin/routes/:id', () => {
    it('should update route fields and return 200', async () => {
      const updated = { ...mockRoute, upstream_model: 'claude-sonnet-4-6' }
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updated, error: null }),
      }
      mockFrom.mockReturnValueOnce(updateChain)

      const res = await app.request('/admin/routes/route-uuid-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upstream_model: 'claude-sonnet-4-6' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toBeDefined()
    })
  })

  // ─── PATCH /admin/routes/:id/toggle ─────────────────────────────────────

  describe('PATCH /admin/routes/:id/toggle', () => {
    it('should toggle is_active from true to false and return 200', async () => {
      // 1st call: fetch current record
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRoute, error: null }),
      }
      // 2nd call: count active routes for same tag (2 active, so no warning)
      const countChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
      countChain.eq = vi.fn()
        .mockReturnValueOnce({
          ...countChain,
          eq: vi.fn().mockResolvedValue({ data: [mockRoute, { ...mockRoute, id: 'route-uuid-2' }], error: null }),
        })
      // 3rd call: update
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { ...mockRoute, is_active: false }, error: null }),
      }
      mockFrom
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce({ select: vi.fn().mockReturnValue(countChain) })
        .mockReturnValueOnce(updateChain)

      const res = await app.request('/admin/routes/route-uuid-1/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toBeDefined()
      expect(body.warning).toBeUndefined()
    })

    it('should return warning when toggling the last active route for a tag', async () => {
      // 1st call: fetch current record (is_active: true)
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRoute, error: null }),
      }
      // 2nd call: count active routes -> only 1
      const countChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
      countChain.eq = vi.fn()
        .mockReturnValueOnce({
          ...countChain,
          eq: vi.fn().mockResolvedValue({ data: [mockRoute], error: null }),
        })
      // 3rd call: update
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { ...mockRoute, is_active: false }, error: null }),
      }
      mockFrom
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce({ select: vi.fn().mockReturnValue(countChain) })
        .mockReturnValueOnce(updateChain)

      const res = await app.request('/admin/routes/route-uuid-1/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.warning).toBe('last_active_route')
    })

    it('should return 404 when route does not exist', async () => {
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'no rows' },
        }),
      }
      mockFrom.mockReturnValueOnce(selectChain)

      const res = await app.request('/admin/routes/nonexistent-id/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(404)
    })
  })

  // ─── Authorization ───────────────────────────────────────────────────────

  describe('Authorization — /admin/routes', () => {
    it('should return 403 when not admin', async () => {
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

      const res = await noAdminApp.request('/admin/routes')
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('admin_required')
    })
  })
})

// =============================================================================
// Spend Limit Admin Endpoints — T6
// =============================================================================

describe('Admin Spend Endpoints — T6', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Hono()
    app.use('/admin/*', async (c, next) => {
      c.set('userId', 'admin-uuid')
      c.set('user', { id: 'admin-uuid', email: 'admin@example.com' })
      await next()
    })
    app.route('/admin', adminRoutes())
  })

  describe('GET /admin/keys/:id/spend', () => {
    it('should return spend info for existing key', async () => {
      const mockKey = {
        id: 'key-uuid-1',
        name: 'my-key',
        prefix: 'apx-sk-ab',
        user_id: 'user-uuid-1',
        status: 'active',
        spend_limit_usd: 5000,
        spent_usd: 1234,
      }

      const chain = makeSupabaseChain({ data: mockKey, error: null })
      mockFrom.mockReturnValueOnce(chain)

      const res = await app.request('/admin/keys/key-uuid-1/spend')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.id).toBe('key-uuid-1')
      expect(body.data.spend_limit_usd).toBe(5000)
      expect(body.data.spent_usd).toBe(1234)
      expect(body.data.key_prefix).toBe('apx-sk-ab')
    })

    it('should return 404 when key does not exist', async () => {
      const chain = makeSupabaseChain({ data: null, error: { code: 'PGRST116', message: 'No rows found' } })
      mockFrom.mockReturnValueOnce(chain)

      const res = await app.request('/admin/keys/nonexistent/spend')
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /admin/keys/:id/spend-limit', () => {
    it('should update spend_limit_usd successfully', async () => {
      const existingKey = { id: 'key-uuid-1', spent_usd: 1000 }

      // First call: fetch existing key
      const fetchChain = makeSupabaseChain({ data: existingKey, error: null })
      // Second call: update
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain)

      const res = await app.request('/admin/keys/key-uuid-1/spend-limit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_limit_usd: 10000 }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.spend_limit_usd).toBe(10000)
      expect(body.data.spent_usd).toBe(1000)
    })

    it('should return 400 when spend_limit_usd is invalid (< -1)', async () => {
      const res = await app.request('/admin/keys/key-uuid-1/spend-limit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_limit_usd: -5 }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_parameter')
    })

    it('should return 400 when spend_limit_usd is missing', async () => {
      const res = await app.request('/admin/keys/key-uuid-1/spend-limit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
    })

    it('should return 404 when key does not exist', async () => {
      const fetchChain = makeSupabaseChain({ data: null, error: { code: 'PGRST116' } })
      mockFrom.mockReturnValueOnce(fetchChain)

      const res = await app.request('/admin/keys/nonexistent/spend-limit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_limit_usd: 1000 }),
      })

      expect(res.status).toBe(404)
    })

    it('should allow spend_limit_usd = 0 (full block)', async () => {
      const existingKey = { id: 'key-uuid-1', spent_usd: 0 }
      const fetchChain = makeSupabaseChain({ data: existingKey, error: null })
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain)

      const res = await app.request('/admin/keys/key-uuid-1/spend-limit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_limit_usd: 0 }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.spend_limit_usd).toBe(0)
    })

    it('should allow spend_limit_usd = -1 (unlimited)', async () => {
      const existingKey = { id: 'key-uuid-1', spent_usd: 500 }
      const fetchChain = makeSupabaseChain({ data: existingKey, error: null })
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain)

      const res = await app.request('/admin/keys/key-uuid-1/spend-limit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_limit_usd: -1 }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.spend_limit_usd).toBe(-1)
    })
  })

  describe('POST /admin/keys/:id/reset-spend', () => {
    it('should reset spent_usd to 0 for existing key', async () => {
      const existingKey = { id: 'key-uuid-1', spend_limit_usd: 5000 }
      const fetchChain = makeSupabaseChain({ data: existingKey, error: null })
      mockFrom.mockReturnValueOnce(fetchChain)
      mockResetSpend.mockResolvedValue(undefined)

      const res = await app.request('/admin/keys/key-uuid-1/reset-spend', {
        method: 'POST',
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.id).toBe('key-uuid-1')
      expect(body.data.spent_usd).toBe(0)
      expect(body.data.spend_limit_usd).toBe(5000)
      expect(body.data.message).toBeDefined()
      expect(mockResetSpend).toHaveBeenCalledWith('key-uuid-1')
    })

    it('should return 404 when key does not exist', async () => {
      const fetchChain = makeSupabaseChain({ data: null, error: { code: 'PGRST116' } })
      mockFrom.mockReturnValueOnce(fetchChain)

      const res = await app.request('/admin/keys/nonexistent/reset-spend', {
        method: 'POST',
      })

      expect(res.status).toBe(404)
      expect(mockResetSpend).not.toHaveBeenCalled()
    })
  })

  // ── GET /admin/webhooks（TC-012）────────────────────────────────────────

  describe('GET /admin/webhooks', () => {
    it('should return paginated webhook configs without secret', async () => {
      const webhooks = [
        { id: 'wh-1', user_id: 'u-1', url: 'https://a.com/hook', events: ['quota_warning'], is_active: true, created_at: '2026-03-15T00:00:00Z' },
        { id: 'wh-2', user_id: 'u-2', url: 'https://b.com/hook', events: ['spend_warning'], is_active: false, created_at: '2026-03-14T00:00:00Z' },
      ]
      const chain = makeSupabaseChain({ data: webhooks, error: null, count: 2 })
      mockFrom.mockReturnValueOnce(chain)

      const res = await app.request('/admin/webhooks')
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data).toHaveLength(2)
      expect(body.pagination).toBeDefined()
      expect(body.pagination.page).toBe(1)
      for (const wh of body.data) {
        expect(wh).not.toHaveProperty('secret')
      }
    })

    it('should support page and limit params', async () => {
      const chain = makeSupabaseChain({ data: [], error: null, count: 0 })
      mockFrom.mockReturnValueOnce(chain)

      const res = await app.request('/admin/webhooks?page=2&limit=10')
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.pagination.page).toBe(2)
      expect(body.pagination.limit).toBe(10)
    })

    it('should return 500 on DB error', async () => {
      const chain = makeSupabaseChain({ data: null, error: { message: 'db error' }, count: null })
      mockFrom.mockReturnValueOnce(chain)

      const res = await app.request('/admin/webhooks')
      expect(res.status).toBe(500)
    })
  })
})
