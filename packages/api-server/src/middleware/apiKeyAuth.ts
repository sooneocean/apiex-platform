import { createMiddleware } from 'hono/factory'
import { createHash } from 'node:crypto'
import { Errors } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'

const API_KEY_PREFIX = 'apx-sk-'

/**
 * Lookup function type for API key verification.
 * Injectable — T04 will replace the default stub with real DB queries.
 */
export type ApiKeyLookupFn = (keyHash: string) => Promise<{ data: Record<string, unknown> | null; error: unknown }>

/**
 * Default lookup: queries Supabase api_keys table.
 */
export const defaultApiKeyLookup: ApiKeyLookupFn = async (keyHash) => {
  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .eq('status', 'active')
    .single()
  return { data, error }
}

/** Current lookup function — can be replaced via setApiKeyLookup() for testing or DI. */
let lookupFn: ApiKeyLookupFn = defaultApiKeyLookup

export function setApiKeyLookup(fn: ApiKeyLookupFn): void {
  lookupFn = fn
}

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

  const { data, error } = await lookupFn(keyHash)

  if (error || !data) {
    return Errors.invalidApiKey()
  }

  // Attach key info to context for downstream handlers
  c.set('apiKey', data)
  c.set('apiKeyId', data.id as string)
  c.set('userId', data.user_id as string)
  c.set('apiKeyTier', (data.rate_limit_tier as string) ?? 'free')
  await next()
})
