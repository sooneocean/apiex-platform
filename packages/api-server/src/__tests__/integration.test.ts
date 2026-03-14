/**
 * T18 — Integration Tests
 * Tests the full request lifecycle through the Hono app.
 * Uses mocked Supabase + upstream APIs (no real external calls).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock all external dependencies
vi.mock('../lib/supabase.js', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
  }
  return {
    supabaseAdmin: {
      from: vi.fn().mockReturnValue(mockChain),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } }),
    },
  })),
}))

// Mock global fetch for upstream API calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { createApp } = await import('../index.js')
const { supabaseAdmin } = await import('../lib/supabase.js')

describe('Integration Tests — T18', () => {
  const app = createApp()
  const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
  const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Health check', () => {
    it('GET /health should return 200', async () => {
      const res = await app.request('/health')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
    })
  })

  describe('Auth flow', () => {
    it('POST /auth/login with invalid token should return 401', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: 'invalid' }),
      })
      expect(res.status).toBe(401)
    })
  })

  describe('API Key lifecycle', () => {
    it('/v1/* without auth should return 401', async () => {
      const res = await app.request('/v1/models')
      expect(res.status).toBe(401)
    })

    it('/keys without JWT should return 401', async () => {
      const res = await app.request('/keys')
      expect(res.status).toBe(401)
    })
  })

  describe('Admin access control', () => {
    it('/admin/users without JWT should return 401', async () => {
      const res = await app.request('/admin/users')
      expect(res.status).toBe(401)
    })
  })

  describe('Error format consistency', () => {
    it('all errors should use OpenAI error format', async () => {
      // 404
      const res404 = await app.request('/nonexistent')
      expect(res404.status).toBe(404)
      const body404 = await res404.json()
      expect(body404.error).toBeDefined()
      expect(body404.error.message).toBeDefined()
      expect(body404.error.type).toBeDefined()
      expect(body404.error.code).toBeDefined()

      // 401 on /v1/*
      const res401 = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'apex-smart', messages: [] }),
      })
      expect(res401.status).toBe(401)
      const body401 = await res401.json()
      expect(body401.error.type).toBe('authentication_error')
    })
  })
})
