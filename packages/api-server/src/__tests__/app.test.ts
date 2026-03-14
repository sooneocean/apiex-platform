/**
 * T03 TDD — Hono App 骨架測試
 * Tests: health check, error format, apiKeyAuth, adminAuth
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// ---------- Mocks ----------

// Mock supabase admin client
const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
const mockEqStatus = vi.fn().mockReturnValue({ single: mockSingle })
const mockEqHash = vi.fn().mockReturnValue({ eq: mockEqStatus })
const mockSelect = vi.fn().mockReturnValue({ eq: mockEqHash })
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

// Mock @supabase/supabase-js for adminAuth
const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: null },
  error: { message: 'invalid' },
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  })),
}))

// Import app after mocks
const { createApp } = await import('../index.js')

describe('Hono App — T03 骨架測試', () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset defaults
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
    // Rebuild mock chain
    mockEqStatus.mockReturnValue({ single: mockSingle })
    mockEqHash.mockReturnValue({ eq: mockEqStatus })
    mockSelect.mockReturnValue({ eq: mockEqHash })
    mockFrom.mockReturnValue({ select: mockSelect })

    app = createApp()
  })

  // --- DoD Case 1: should_returnOk_whenHealthCheck ---
  it('GET /health should return 200 with status ok and timestamp', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok' })
    expect(body.timestamp).toBeDefined()
    // Verify ISO8601 format
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp)
  })

  // --- DoD Case 2: should_returnOpenAIErrorFormat_whenUnhandledError ---
  it('unknown route should return 404 in OpenAI error format', async () => {
    const res = await app.request('/unknown-route')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toMatchObject({
      error: {
        message: expect.any(String),
        type: expect.any(String),
        code: expect.any(String),
      },
    })
  })

  // --- DoD Case 3: should_return401_whenNoAuthHeader ---
  it('request to /v1/* without Authorization header should return 401', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'apex-smart', messages: [] }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({
      error: {
        type: 'authentication_error',
        code: 'invalid_api_key',
      },
    })
  })

  // --- DoD Case 4: should_return401_whenInvalidBearerFormat ---
  it('request to /v1/* with malformed Bearer token should return 401', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer not-a-valid-key',
      },
      body: JSON.stringify({ model: 'apex-smart', messages: [] }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({
      error: {
        type: 'authentication_error',
        code: 'invalid_api_key',
      },
    })
  })

  // --- DoD Case 5: should_return403_whenNonAdminEmail ---
  it('admin endpoint with valid JWT but non-admin email should return 403', async () => {
    // Mock getUser returns a valid user with non-admin email
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'nobody@example.com' } },
      error: null,
    })

    const res = await app.request('/admin/users', {
      headers: { Authorization: 'Bearer valid-jwt-token' },
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toMatchObject({
      error: {
        type: 'authorization_error',
        code: 'admin_required',
      },
    })
  })

  // --- DoD Case 6: should_setApiKeyId_whenValidKey ---
  it('valid API key should pass auth and set context variables', async () => {
    const fakeKeyData = {
      id: 'key-uuid-001',
      user_id: 'user-uuid-001',
      key_hash: 'abc123',
      status: 'active',
    }
    mockSingle.mockResolvedValue({ data: fakeKeyData, error: null })

    // We need a route that actually responds after auth passes.
    // Since /v1/* has no handler registered, it will 404 after middleware.
    // We create a custom app with a test route.
    const { Hono } = await import('hono')
    const { apiKeyAuth } = await import('../middleware/apiKeyAuth.js')

    const testApp = new Hono()
    testApp.use('/v1/*', apiKeyAuth)
    testApp.get('/v1/test', (c) => {
      return c.json({
        apiKey: c.get('apiKey'),
        apiKeyId: c.get('apiKeyId'),
        userId: c.get('userId'),
      })
    })

    const res = await testApp.request('/v1/test', {
      headers: { Authorization: 'Bearer apx-sk-test-key-123' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.apiKey).toMatchObject({ id: 'key-uuid-001', user_id: 'user-uuid-001' })
    expect(body.apiKeyId).toBe('key-uuid-001')
    expect(body.userId).toBe('user-uuid-001')
  })

  // --- Admin without JWT should return 401 ---
  it('admin endpoint without JWT should return 401', async () => {
    const res = await app.request('/admin/users')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({
      error: {
        type: 'authentication_error',
      },
    })
  })
})
