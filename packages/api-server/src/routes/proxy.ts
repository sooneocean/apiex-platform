import { Hono } from 'hono'
import { stream as honoStream } from 'hono/streaming'
import { RouterService } from '../services/RouterService.js'
import { KeyService } from '../services/KeyService.js'
import { UsageLogger, type UsageLogEntry } from '../services/UsageLogger.js'
import { InsufficientQuotaError } from '../lib/errors.js'
import type { OpenAIRequest } from '../adapters/types.js'
import { supabaseAdmin } from '../lib/supabase.js'

export function proxyRoutes() {
  const router = new Hono()
  const routerService = new RouterService()
  const keyService = new KeyService()
  const usageLogger = new UsageLogger()

  /**
   * POST /chat/completions
   * Pipeline: resolveRoute → reserveQuota → forward → logUsage → settleQuota → return
   */
  router.post('/chat/completions', async (c) => {
    const apiKeyId = c.get('apiKeyId') as string
    const body = await c.req.json<OpenAIRequest>()
    const isStream = body.stream === true
    const estimatedTokens = body.max_tokens ?? 4096
    const startTime = Date.now()

    // 1. Resolve route
    const route = await routerService.resolveRoute(body.model)

    // 2. Reserve quota
    const reservation = await keyService.reserveQuota(apiKeyId, estimatedTokens)
    if (!reservation.success) {
      throw new InsufficientQuotaError()
    }

    // 3. Forward to upstream
    const result = await routerService.forward(route, body, isStream)

    if (result.type === 'json') {
      // Non-streaming response
      const latencyMs = Date.now() - startTime
      const usage = result.data.usage

      // Fire-and-forget: log usage + settle quota
      const logEntry: UsageLogEntry = {
        apiKeyId,
        modelTag: route.tag,
        upstreamModel: route.upstream_model,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        latencyMs,
        status: 'success',
      }
      usageLogger.logUsage(logEntry).catch(() => {})
      keyService.settleQuota(apiKeyId, estimatedTokens, usage.total_tokens).catch(() => {})

      return c.json(result.data)
    }

    // Streaming response
    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('Connection', 'keep-alive')

    return honoStream(c, async (stream) => {
      const reader = result.stream.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          await stream.write(value)
        }
      } catch (err) {
        console.error('Stream error:', err)
      } finally {
        // Stream complete — settle quota and log usage
        const latencyMs = Date.now() - startTime
        const usage = result.usage

        const logEntry: UsageLogEntry = {
          apiKeyId,
          modelTag: route.tag,
          upstreamModel: route.upstream_model,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          latencyMs,
          status: 'success',
        }
        usageLogger.logUsage(logEntry).catch(() => {})
        keyService.settleQuota(apiKeyId, estimatedTokens, usage.total_tokens).catch(() => {})
      }
    })
  })

  /**
   * GET /models
   * Returns active models in OpenAI list format.
   */
  router.get('/models', async (c) => {
    const models = await routerService.listActiveModels()
    return c.json({
      object: 'list',
      data: models,
    })
  })

  /**
   * GET /usage/summary
   * Returns usage summary for the current API key.
   */
  router.get('/usage/summary', async (c) => {
    const apiKeyId = c.get('apiKeyId') as string

    const { data, error } = await supabaseAdmin
      .from('usage_logs')
      .select('*')
      .eq('api_key_id', apiKeyId)

    const logs = (data ?? []) as Array<{
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
    }>

    const summary = {
      total_requests: logs.length,
      total_prompt_tokens: logs.reduce((sum, l) => sum + (l.prompt_tokens ?? 0), 0),
      total_completion_tokens: logs.reduce((sum, l) => sum + (l.completion_tokens ?? 0), 0),
      total_tokens: logs.reduce((sum, l) => sum + (l.total_tokens ?? 0), 0),
    }

    return c.json(summary)
  })

  return router
}
