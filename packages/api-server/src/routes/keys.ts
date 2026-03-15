import { Hono } from 'hono'
import { KeyService } from '../services/KeyService.js'
import { Errors } from '../lib/errors.js'

/** spend_limit_usd 有效值：-1（無限）或 >= 0 的整數 */
function isValidSpendLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= -1
}

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

    const body = await c.req.json<{ name?: string; spend_limit_usd?: number }>().catch(() => ({}))
    const name = body.name ?? ''

    // Validate spend_limit_usd if provided
    if (body.spend_limit_usd !== undefined && !isValidSpendLimit(body.spend_limit_usd)) {
      return Errors.invalidParam('spend_limit_usd must be an integer >= -1 (-1 means unlimited).')
    }

    const spendLimitUsd = body.spend_limit_usd ?? -1
    const result = await keyService.createKey(userId, name, spendLimitUsd)

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
          spend_limit_usd: result.spend_limit_usd,
          spent_usd: result.spent_usd,
          created_at: result.created_at,
        },
        warning: 'This key will not be shown again. Store it securely.',
      },
      201
    )
  })

  /**
   * PATCH /keys/:id — Update spend limit for an API key.
   * Body: { spend_limit_usd: number }
   */
  router.patch('/:id', async (c) => {
    const userId = c.get('userId') as string
    const keyId = c.req.param('id')

    const body = await c.req.json<{ spend_limit_usd?: number }>().catch(() => ({}))

    if (body.spend_limit_usd === undefined || !isValidSpendLimit(body.spend_limit_usd)) {
      return Errors.invalidParam('spend_limit_usd must be an integer >= -1 (-1 means unlimited).')
    }

    try {
      await keyService.updateSpendLimit(userId, keyId, body.spend_limit_usd)
      return c.json({
        data: {
          id: keyId,
          spend_limit_usd: body.spend_limit_usd,
        },
      })
    } catch {
      return Errors.notFound()
    }
  })

  /**
   * POST /keys/:id/reset-spend — Reset the spend counter for an API key.
   */
  router.post('/:id/reset-spend', async (c) => {
    const userId = c.get('userId') as string
    const keyId = c.req.param('id')

    // Verify the key belongs to this user before resetting
    const keys = await keyService.listKeys(userId)
    const ownedKey = keys.find((k) => k.id === keyId)

    if (!ownedKey) {
      return Errors.notFound()
    }

    try {
      await keyService.resetSpend(keyId)
      return c.json({
        data: {
          id: keyId,
          spent_usd: 0,
          spend_limit_usd: ownedKey.spend_limit_usd,
          message: 'Spend counter reset successfully',
        },
      })
    } catch {
      return Errors.internalError()
    }
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
