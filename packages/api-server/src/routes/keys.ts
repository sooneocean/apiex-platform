import { Hono } from 'hono'
import { KeyService } from '../services/KeyService.js'
import { Errors } from '../lib/errors.js'

/**
 * Keys routes — all routes expect userId to be set by parent middleware.
 * Auth is handled by the parent app (supabaseJwtAuth).
 */
export function keysRoutes() {
  const router = new Hono()
  const keyService = new KeyService()

  /**
   * GET /keys — List current user's API keys
   */
  router.get('/', async (c) => {
    const userId = c.get('userId') as string
    const keys = await keyService.listKeys(userId)
    return c.json({ data: keys })
  })

  /**
   * POST /keys — Create a new API key
   */
  router.post('/', async (c) => {
    const userId = c.get('userId') as string
    const body = await c.req.json<{ name?: string }>().catch(() => ({}))
    const name = body.name ?? ''

    const result = await keyService.createKey(userId, name)

    return c.json(
      {
        data: {
          id: result.id,
          key: result.key,
          key_prefix: result.prefix,
          name: result.name ?? name,
          status: result.status ?? 'active',
          quota_tokens: result.quota_tokens ?? -1,
          created_at: result.created_at ?? new Date().toISOString(),
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
      const result = await keyService.revokeKey(userId, keyId)
      return c.json({
        data: {
          id: result?.id ?? keyId,
          status: 'revoked',
          revoked_at: result?.revoked_at ?? new Date().toISOString(),
        },
      })
    } catch {
      return Errors.notFound()
    }
  })

  return router
}
