import { createMiddleware } from 'hono/factory'
import { createHash } from 'node:crypto'
import { Errors } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'

const API_KEY_PREFIX = 'apx-sk-'

export const apiKeyAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Errors.invalidApiKey()
  }

  const apiKey = authHeader.slice(7) // Remove "Bearer "
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return Errors.invalidApiKey()
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex')

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .eq('status', 'active')
    .single()

  if (error || !data) {
    return Errors.invalidApiKey()
  }

  // Attach key info to context for downstream handlers
  c.set('apiKey', data)
  c.set('userId', data.user_id)
  await next()
})
