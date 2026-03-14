/**
 * T03 TDD — Hono App 骨架測試
 * RED: 此時 app.ts 尚未實作，測試預期全部失敗
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase before importing app
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

// Import app after mocks are set up
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
        type: expect.any(String),
        code: expect.any(String),
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
