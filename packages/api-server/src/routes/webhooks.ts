import { Hono } from 'hono'
import { WebhookService } from '../services/WebhookService.js'
import { Errors } from '../lib/errors.js'

/**
 * Webhook 設定與通知路由
 * 所有路由均需 supabaseJwtAuth（在 index.ts 掛載層設定）
 */
export function webhookRoutes() {
  const router = new Hono()
  const webhookService = new WebhookService()

  /**
   * GET /webhooks
   * 取得目前用戶的 webhook 設定
   */
  router.get('/', async (c) => {
    const userId = c.get('userId') as string
    const config = await webhookService.getConfig(userId)
    return c.json({ data: config })
  })

  /**
   * POST /webhooks
   * 建立或更新 webhook 設定（upsert）
   */
  router.post('/', async (c) => {
    const userId = c.get('userId') as string
    const body = await c.req.json<{
      url?: string
      secret?: string
      events?: string[]
    }>().catch(() => ({}))

    if (!body.url || typeof body.url !== 'string') {
      return Errors.invalidParam('url is required')
    }

    try {
      const config = await webhookService.upsertConfig(
        userId,
        body.url,
        body.secret,
        body.events
      )
      return c.json({ data: config })
    } catch (err) {
      if (err instanceof Error && err.message.includes('Invalid webhook URL')) {
        return Errors.invalidParam('Invalid webhook URL format. Must be a valid http/https URL.')
      }
      throw err
    }
  })

  /**
   * DELETE /webhooks/:id
   * 刪除 webhook 設定
   */
  router.delete('/:id', async (c) => {
    const userId = c.get('userId') as string
    const configId = c.req.param('id')

    try {
      await webhookService.deleteConfig(userId, configId)
      return c.json({ data: { id: configId, deleted: true } })
    } catch {
      return Errors.notFound()
    }
  })

  /**
   * GET /webhooks/:id/logs
   * 查看指定 webhook config 的推播記錄
   */
  router.get('/:id/logs', async (c) => {
    const userId = c.get('userId') as string
    const configId = c.req.param('id')

    // 驗證該 config 屬於此用戶
    const config = await webhookService.getConfig(userId)
    if (!config || config.id !== configId) {
      return Errors.notFound()
    }

    const logs = await webhookService.listLogs(configId)
    return c.json({ data: logs })
  })

  /**
   * POST /webhooks/test
   * 發送一次測試推播（使用現有設定）
   */
  router.post('/test', async (c) => {
    const userId = c.get('userId') as string

    const result = await webhookService.sendNotification(userId, 'quota_warning', {
      event: 'quota_warning',
      threshold: 0,
      key_id: 'test',
      quota_tokens: 100000,
      used_tokens: 0,
      usage_percent: 0,
      timestamp: new Date().toISOString(),
      is_test: true,
    })

    if (!result) {
      return Errors.notFound()
    }

    return c.json({ data: result })
  })

  return router
}
