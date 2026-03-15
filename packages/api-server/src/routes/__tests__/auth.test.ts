/**
 * T10 TDD — Auth Route 測試 (包含 GET /me)
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

// Mock isAdmin lib
vi.mock('../../lib/isAdmin.js', () => ({
  isAdminEmail: vi.fn((email: string) => email === 'admin@example.com'),
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

  describe('GET /auth/me', () => {
    it('should return user info with isAdmin=true for admin email', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'admin-uuid',
            email: 'admin@example.com',
          },
        },
        error: null,
      })

      const res = await app.request('/auth/me', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-admin-token' },
      })

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { id: string; email: string; isAdmin: boolean } }
      expect(body.data.id).toBe('admin-uuid')
      expect(body.data.email).toBe('admin@example.com')
      expect(body.data.isAdmin).toBe(true)
    })

    it('should return user info with isAdmin=false for non-admin email', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-uuid',
            email: 'user@example.com',
          },
        },
        error: null,
      })

      const res = await app.request('/auth/me', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-user-token' },
      })

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { id: string; email: string; isAdmin: boolean } }
      expect(body.data.isAdmin).toBe(false)
    })

    it('should return 401 without Authorization header', async () => {
      const res = await app.request('/auth/me', {
        method: 'GET',
      })

      expect(res.status).toBe(401)
    })

    it('should return 401 with invalid token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'invalid token' },
      })

      const res = await app.request('/auth/me', {
        method: 'GET',
        headers: { Authorization: 'Bearer bad-token' },
      })

      expect(res.status).toBe(401)
    })
  })
})
