import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { Errors } from '../lib/errors.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''

export function authRoutes() {
  const router = new Hono()

  /**
   * POST /auth/login
   * Validate a Supabase access_token and return user info.
   */
  router.post('/login', async (c) => {
    const body = await c.req.json<{ access_token?: string }>()

    if (!body.access_token) {
      return Errors.invalidToken()
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${body.access_token}` } },
      auth: { persistSession: false },
    })

    const { data: { user }, error } = await supabase.auth.getUser(body.access_token)

    if (error || !user) {
      return Errors.invalidToken()
    }

    return c.json({
      user: {
        id: user.id,
        email: user.email,
      },
      session: {
        access_token: body.access_token,
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1hr placeholder
      },
    })
  })

  return router
}
