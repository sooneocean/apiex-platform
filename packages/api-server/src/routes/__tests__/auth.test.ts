/**
 * T10 TDD — Auth Route 測試
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// Mock @supabase/supabase-js
const mockGetUser = vi.fn()
const mockSignInWithPassword = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
    },
  })),
}))

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: {
      admin: {
        getUserById: vi.fn(),
      },
    },
  },
}))

const { authRoutes } = await import('../auth.js')

describe('Auth Route — T10', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Hono()
    app.route('/auth', authRoutes())
  })

  describe('POST /auth/login', () => {
    it('should return user and session on valid access_token', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-uuid-123',
            email: 'test@example.com',
          },
        },
        error: null,
      })

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: 'valid-supabase-jwt' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.user).toMatchObject({
        id: 'user-uuid-123',
        email: 'test@example.com',
      })
    })

    it('should return 401 on invalid access_token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'invalid token' },
      })

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: 'invalid-token' }),
      })

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.code).toBe('invalid_token')
    })

    it('should return 401 when access_token is missing', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(401)
    })
  })
})
