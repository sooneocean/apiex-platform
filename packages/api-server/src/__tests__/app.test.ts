/**
 * T03 TDD — Hono App 骨架測試
 * Tests: health check, 404 handler, apiKeyAuth, adminAuth
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase modules before importing app
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
          }),
        }),
      }),
    }),
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } }),
    },
  })),
}))

const { createApp } = await import('../index.js')

describe('Hono App — 骨架測試', () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  it('GET /health should return 200 with status ok', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok' })
  })

  it('unknown route should return 404 in OpenAI error format', async () => {
    const res = await app.request('/unknown-route')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'not_found',
      },
    })
  })

  it('request to /v1/* without API Key should return 401', async () => {
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

  it('request to /v1/* with malformed API Key should return 401', async () => {
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
