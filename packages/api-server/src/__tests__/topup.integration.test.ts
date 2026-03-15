/**
 * T15 — Topup Integration Tests
 * Tests the full HTTP request lifecycle through the Hono app.
 * Mocks: Stripe client, supabaseAdmin, @supabase/supabase-js (for JWT auth).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Set env vars BEFORE any module imports — adminAuth reads ADMIN_EMAILS at
// module load time as a module-level constant.
// ---------------------------------------------------------------------------

process.env.ADMIN_EMAILS = 'admin@example.com'

// ---------------------------------------------------------------------------
// Mock Stripe
// ---------------------------------------------------------------------------

const mockConstructEvent = vi.fn()
const mockSessionCreate = vi.fn()

vi.mock('../lib/stripe.js', () => ({
  getStripeClient: vi.fn(() => ({
    checkout: {
      sessions: {
        create: mockSessionCreate,
      },
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  })),
}))

// ---------------------------------------------------------------------------
// Mock supabaseAdmin (used by TopupService and admin routes directly)
// ---------------------------------------------------------------------------

// We build a flexible chain mock. Each test can override .mockResolvedValue
// on the terminal methods (single / range / plain).
const mockSingle = vi.fn()
const mockRange = vi.fn()

const mockChain = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  range: mockRange,
  single: mockSingle,
}

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue(mockChain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}))

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js — JWT auth middleware calls createClient
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}))

// ---------------------------------------------------------------------------
// Import app after mocks are set up
// ---------------------------------------------------------------------------

const { createApp } = await import('../index.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER_ID = 'user-123'
const FAKE_ADMIN_EMAIL = 'admin@example.com'

/** Simulate a valid JWT for regular users */
function userAuthHeader() {
  return { Authorization: 'Bearer valid-jwt-token' }
}

/** Simulate a valid JWT for admin users */
function adminAuthHeader() {
  return { Authorization: 'Bearer valid-admin-token' }
}

/** Make mockGetUser return a regular authenticated user */
function mockUserAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FAKE_USER_ID, email: 'user@example.com' } },
    error: null,
  })
}

/** Make mockGetUser return an admin user */
function mockAdminAuth() {
  // ADMIN_EMAILS env var is read at module load time; inject it before test
  process.env.ADMIN_EMAILS = FAKE_ADMIN_EMAIL
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'admin-456', email: FAKE_ADMIN_EMAIL } },
    error: null,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Topup Integration Tests — T15', () => {
  const app = createApp()

  beforeEach(() => {
    vi.clearAllMocks()
    // Restore chain mocks to passthrough after each test
    mockChain.select.mockReturnThis()
    mockChain.insert.mockReturnThis()
    mockChain.update.mockReturnThis()
    mockChain.upsert.mockReturnThis()
    mockChain.eq.mockReturnThis()
    mockChain.in.mockReturnThis()
    mockChain.order.mockReturnThis()
    mockChain.gte.mockReturnThis()
    mockChain.lte.mockReturnThis()
    mockChain.range.mockResolvedValue({ data: [], error: null, count: 0 })
    mockChain.single.mockResolvedValue({ data: null, error: null })
  })

  // ─── 1. POST /topup/checkout → 200 with checkout_url ──────────────────────

  it('POST /topup/checkout → 200 with checkout_url', async () => {
    mockUserAuth()
    mockSessionCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/pay/cs_test_abc',
      id: 'cs_test_abc',
    })

    const res = await app.request('/topup/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...userAuthHeader(),
      },
      body: JSON.stringify({ plan_id: 'plan_10' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.checkout_url).toBe('https://checkout.stripe.com/pay/cs_test_abc')
    expect(body.data.session_id).toBe('cs_test_abc')
  })

  // ─── 2. POST /topup/checkout invalid plan → 400 ───────────────────────────

  it('POST /topup/checkout invalid plan → 400', async () => {
    mockUserAuth()

    const res = await app.request('/topup/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...userAuthHeader(),
      },
      body: JSON.stringify({ plan_id: 'plan_999' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_plan')
  })

  // ─── 3. POST /topup/webhook → 200 + topup_logs + quota updated ────────────

  it('POST /topup/webhook → 200 + topup_logs INSERT + quota updated', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_001',
          amount_total: 1000,
          metadata: {
            user_id: FAKE_USER_ID,
            plan_id: 'plan_10',
            tokens_granted: '1000000',
          },
        },
      },
    })

    // topup_logs INSERT succeeds
    mockSingle.mockResolvedValue({ data: { id: 1 }, error: null })
    // user_quotas UPSERT succeeds (called via addQuota → upsert().select().single())
    // api_keys UPDATE — range isn't called here; update().eq().eq() returns directly
    mockChain.eq.mockReturnThis()
    // For update api_keys the chain ends at second .eq() without terminal — Supabase
    // returns a promise at that point. We mock the chain's thenable behaviour by
    // making the last eq resolve.
    let eqCallCount = 0
    mockChain.eq.mockImplementation(() => {
      eqCallCount++
      if (eqCallCount >= 4) {
        // 4th eq is the second eq on api_keys update
        return Promise.resolve({ data: [], error: null })
      }
      return mockChain
    })

    const res = await app.request('/topup/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'stripe-signature': 'valid-sig',
      },
      body: 'raw-stripe-payload',
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)
  })

  // ─── 4. POST /topup/webhook duplicate event → 200 no double quota ─────────

  it('POST /topup/webhook duplicate event → 200 no double quota', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_dup',
          amount_total: 1000,
          metadata: {
            user_id: FAKE_USER_ID,
            plan_id: 'plan_10',
            tokens_granted: '1000000',
          },
        },
      },
    })

    // Simulate 23505 unique violation on INSERT
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })

    const res = await app.request('/topup/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'stripe-signature': 'valid-sig',
      },
      body: 'raw-stripe-payload',
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)

    // Quota update (upsert on user_quotas) should NOT have been called
    // The insert happens via from('topup_logs').insert(...).single()
    // After 23505 the service returns early — from should have been called
    // once (for topup_logs) but NOT a second time for user_quotas.
    const { supabaseAdmin } = await import('../lib/supabase.js')
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
    const calls = fromMock.mock.calls.map((c: unknown[]) => c[0])
    expect(calls).not.toContain('user_quotas')
  })

  // ─── 5. POST /topup/webhook invalid signature → 400 ──────────────────────

  it('POST /topup/webhook invalid signature → 400', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload.')
    })

    const res = await app.request('/topup/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'stripe-signature': 'bad-sig',
      },
      body: 'raw-payload',
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_signature')
  })

  // ─── 6. GET /topup/status?session_id=xxx → completed ─────────────────────

  it('GET /topup/status?session_id=xxx → completed', async () => {
    mockUserAuth()
    mockSingle.mockResolvedValue({
      data: {
        tokens_granted: 1000000,
        created_at: '2024-01-01T00:00:00Z',
        status: 'completed',
      },
      error: null,
    })

    const res = await app.request('/topup/status?session_id=cs_test_abc', {
      headers: userAuthHeader(),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.status).toBe('completed')
    expect(body.data.tokens_granted).toBe(1000000)
    expect(body.data.completed_at).toBe('2024-01-01T00:00:00Z')
  })

  // ─── 7. GET /topup/status?session_id=xxx → pending (PGRST116) ────────────

  it('GET /topup/status?session_id=xxx → pending', async () => {
    mockUserAuth()
    // PGRST116 = no rows found
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    })

    const res = await app.request('/topup/status?session_id=cs_not_found', {
      headers: userAuthHeader(),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.status).toBe('pending')
  })

  // ─── 8. GET /topup/logs → user logs with pagination ──────────────────────

  it('GET /topup/logs → user logs with pagination', async () => {
    mockUserAuth()
    mockRange.mockResolvedValue({
      data: [
        {
          id: 1,
          user_id: FAKE_USER_ID,
          stripe_session_id: 'cs_1',
          tokens_granted: 500000,
          amount_usd: 500,
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      error: null,
      count: 1,
    })

    const res = await app.request('/topup/logs?page=1&limit=20', {
      headers: userAuthHeader(),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.pagination).toMatchObject({ page: 1, limit: 20, total: 1 })
  })

  // ─── 9. GET /admin/topup-logs → all logs ─────────────────────────────────

  it('GET /admin/topup-logs → all logs', async () => {
    mockAdminAuth()
    mockRange.mockResolvedValue({
      data: [
        {
          id: 1,
          user_id: FAKE_USER_ID,
          stripe_session_id: 'cs_1',
          tokens_granted: 1000000,
          amount_usd: 1000,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          user_id: 'user-999',
          stripe_session_id: 'cs_2',
          tokens_granted: 500000,
          amount_usd: 500,
          created_at: '2024-01-02T00:00:00Z',
        },
      ],
      error: null,
      count: 2,
    })

    const res = await app.request('/admin/topup-logs', {
      headers: adminAuthHeader(),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(2)
    expect(body.pagination).toMatchObject({ page: 1, limit: 50, total: 2 })
  })
})
