import { Hono } from 'hono'
import { KeyService } from '../services/KeyService.js'
import { Errors } from '../lib/errors.js'

/**
 * In-memory rate limiter for POST /keys.
 * Tracks last creation timestamp per userId.
 * 1-second cooldown between key creations.
 */
export const createKeyTimestamps = new Map<string, number>()
const RATE_LIMIT_MS = 1000

/**
 * Keys routes — all routes expect userId to be set by parent middleware.
 * Auth is handled by the parent app (supabaseJwtAuth in index.ts).
 */
export function keysRoutes() {
  const router = new Hono()
  const keyService = new KeyService()

  /**
   * GET /keys — List current user's API keys (masked, no hash)
   */
  router.get('/', async (c) => {
    const userId = c.get('userId') as string
    const keys = await keyService.listKeys(userId)

    // Map KeyService's `prefix` field to API contract's `key_prefix`
    const mapped = keys.map(({ prefix, user_id: _uid, ...rest }) => ({
      ...rest,
      key_prefix: prefix,
    }))

    return c.json({ data: mapped })
  })

  /**
   * POST /keys — Create a new API key.
   * Returns plaintext key (one-time) + warning message.
   * Rate limited: 1 key per user per second (in-memory).
   */
  router.post('/', async (c) => {
    const userId = c.get('userId') as string

    // Rate limit check
    const lastCreate = createKeyTimestamps.get(userId)
    const now = Date.now()
    if (lastCreate && now - lastCreate < RATE_LIMIT_MS) {
      return Errors.rateLimitExceeded()
    }

    const body = await c.req.json<{ name?: string }>().catch(() => ({}))
    const name = body.name ?? ''

    const result = await keyService.createKey(userId, name)

    // Record timestamp for rate limiting
    createKeyTimestamps.set(userId, Date.now())

    return c.json(
      {
        data: {
          id: result.id,
          key: result.key,
          key_prefix: result.prefix,
          name: result.name,
          status: result.status,
          quota_tokens: result.quota_tokens,
          created_at: result.created_at,
        },
        warning: 'This key will not be shown again. Store it securely.',
      },
      201
    )
  })

  /**
   * DELETE /keys/:id — Revoke an API key
   */
  router.delete('/:id', async (c) => {
    const userId = c.get('userId') as string
    const keyId = c.req.param('id')

    try {
      await keyService.revokeKey(userId, keyId)
      return c.json({
        data: {
          id: keyId,
          status: 'revoked',
          revoked_at: new Date().toISOString(),
        },
      })
    } catch {
      return Errors.notFound()
    }
  })

  return router
}

/** @internal — exposed for test cleanup only */
export function _resetRateLimiter() {
  createKeyTimestamps.clear()
}
