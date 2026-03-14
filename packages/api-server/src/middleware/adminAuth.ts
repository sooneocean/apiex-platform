import { createMiddleware } from 'hono/factory'
import { createClient } from '@supabase/supabase-js'
import { Errors } from '../lib/errors.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

export const supabaseJwtAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Errors.invalidToken()
  }

  const token = authHeader.slice(7)

  // Create a per-request client with user's JWT
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return Errors.invalidToken()
  }

  c.set('user', user)
  c.set('userId', user.id)
  await next()
})

export const adminAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Errors.invalidToken()
  }

  const token = authHeader.slice(7)

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return Errors.invalidToken()
  }

  // Check admin whitelist
  if (!user.email || !ADMIN_EMAILS.includes(user.email)) {
    return Errors.adminRequired()
  }

  c.set('user', user)
  c.set('userId', user.id)
  await next()
})
