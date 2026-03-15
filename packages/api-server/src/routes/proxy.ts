import { Hono } from 'hono'
import { stream as honoStream } from 'hono/streaming'
import { RouterService } from '../services/RouterService.js'
import { KeyService } from '../services/KeyService.js'
import { RatesService } from '../services/RatesService.js'
import { UsageLogger, type UsageLogEntry } from '../services/UsageLogger.js'
import { InsufficientQuotaError, Errors } from '../lib/errors.js'
import type { OpenAIRequest } from '../adapters/types.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { rateLimiter } from '../lib/RateLimiter.js'

/**
 * Supported model tags (OpenAI-compat aliases).
 * Only models with the `apex-` prefix are accepted at the gateway level.
 * Everything else returns 400 immediately without touching the database.
 */
function isSupportedModel(model: string): boolean {
  return model.startsWith('apex-')
}

export function proxyRoutes() {
  const router = new Hono()
  const routerService = new RouterService()
  const keyService = new KeyService()
  const ratesService = new RatesService()
  const usageLogger = new UsageLogger()

  /**
   * POST /chat/completions
   *
   * Pipeline (matches DoD):
   *   1. Extract context (apiKeyId, userId) — set by apiKeyAuth middleware
   *   2. Parse body
   *   3. Validate model → 400 if unsupported
   *   4. reserveQuota(estimatedTokens) → 402 if insufficient
   *   5. resolveRoute(model) → 503 if not configured  (refund quota)
   *   6. forward → non-streaming | streaming
   *   7. On success: settleQuota(actual) + logUsage(success)
   *   8. On error:  settleQuota(0) refund all + logUsage(error)
   */
  router.post('/chat/completions', async (c) => {
    const apiKeyId = c.get('apiKeyId') as string
    const body = await c.req.json<OpenAIRequest>()
    const isStream = body.stream === true
    const estimatedTokens = body.max_tokens ?? 4096
    const startTime = Date.now()

    // Step 3 — validate model
    if (!isSupportedModel(body.model)) {
      return Errors.unsupportedModel(body.model)
    }

    // Step 4 — reserve quota
    const reservation = await keyService.reserveQuota(apiKeyId, estimatedTokens)
    if (!reservation.success) {
      throw new InsufficientQuotaError()
    }

    // Step 3.5 — check spend limit (after quota reserve, before upstream)
    const withinLimit = await keyService.checkSpendLimit(apiKeyId)
    if (!withinLimit) {
      // Refund the reserved quota before rejecting
      keyService.settleQuota(apiKeyId, estimatedTokens, 0).catch((err) => console.error('[proxy] fire-and-forget failed:', err))
      return Errors.spendLimitExceeded()
    }

    // Step 5 — resolve route (503 if not configured, with quota refund)
    let route
    try {
      route = await routerService.resolveRoute(body.model)
    } catch {
      // Route not configured — refund reserved quota and return 503
      keyService.settleQuota(apiKeyId, estimatedTokens, 0).catch((err) => console.error('[proxy] fire-and-forget failed:', err))
      return Errors.routeNotConfigured()
    }

    // Step 6 — forward to upstream
    try {
      const result = await routerService.forward(route, body, isStream)

      if (result.type === 'json') {
        // Non-streaming response
        const latencyMs = Date.now() - startTime
        const usage = result.data.usage

        // Fire-and-forget: settle quota + log usage + record spend
        keyService.settleQuota(apiKeyId, estimatedTokens, usage.total_tokens).catch((err) => console.error('[proxy] fire-and-forget failed:', err))
        rateLimiter.record(apiKeyId, usage.total_tokens)
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
        usageLogger.logUsage(logEntry).catch((err) => console.error('[proxy] fire-and-forget failed:', err))

        // Record spend (fire-and-forget): query rate and calculate cost in cents
        ratesService.getEffectiveRate(route.tag, new Date()).then((rate) => {
          if (rate) {
            const costCents = Math.round(
              (usage.prompt_tokens / 1000) * rate.input_rate_per_1k * 100 +
              (usage.completion_tokens / 1000) * rate.output_rate_per_1k * 100
            )
            keyService.recordSpend(apiKeyId, costCents).catch((err) => console.error('[proxy] fire-and-forget failed:', err))
          }
        }).catch((err) => console.error('[proxy] fire-and-forget failed:', err))

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

          keyService.settleQuota(apiKeyId, estimatedTokens, usage.total_tokens).catch((err) => console.error('[proxy] fire-and-forget failed:', err))
          rateLimiter.record(apiKeyId, usage.total_tokens)
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
          usageLogger.logUsage(logEntry).catch((err) => console.error('[proxy] fire-and-forget failed:', err))

          // Record spend (fire-and-forget): query rate and calculate cost in cents
          ratesService.getEffectiveRate(route.tag, new Date()).then((rate) => {
            if (rate) {
              const costCents = Math.round(
                (usage.prompt_tokens / 1000) * rate.input_rate_per_1k * 100 +
                (usage.completion_tokens / 1000) * rate.output_rate_per_1k * 100
              )
              keyService.recordSpend(apiKeyId, costCents).catch((err) => console.error('[proxy] fire-and-forget failed:', err))
            }
          }).catch((err) => console.error('[proxy] fire-and-forget failed:', err))
        }
      })
    } catch (err) {
      // Upstream error — refund full quota + log error
      const latencyMs = Date.now() - startTime
      keyService.settleQuota(apiKeyId, estimatedTokens, 0).catch((err) => console.error('[proxy] fire-and-forget failed:', err))
      const logEntry: UsageLogEntry = {
        apiKeyId,
        modelTag: route.tag,
        upstreamModel: route.upstream_model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs,
        status: 'error',
      }
      usageLogger.logUsage(logEntry).catch((err) => console.error('[proxy] fire-and-forget failed:', err))
      // Re-throw so the error handler returns the correct status
      throw err
    }
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
   * Supports period parameter: 24h | 7d | 30d | all (default: all)
   */
  router.get('/usage/summary', async (c) => {
    const apiKeyId = c.get('apiKeyId') as string
    const period = c.req.query('period') ?? 'all'

    // Build query with period filter
    let query = supabaseAdmin
      .from('usage_logs')
      .select('model_tag, prompt_tokens, completion_tokens, total_tokens')
      .eq('api_key_id', apiKeyId)

    if (period !== 'all') {
      const periodMs: Record<string, number> = {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      }
      const ms = periodMs[period]
      if (ms) {
        const since = new Date(Date.now() - ms).toISOString()
        query = query.gte('created_at', since)
      }
    }

    const { data } = await query

    const logs = (data ?? []) as Array<{
      model_tag: string
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
    }>

    // Calculate totals
    const totalTokens = logs.reduce((sum, l) => sum + (l.total_tokens ?? 0), 0)
    const totalRequests = logs.length

    // Build breakdown by model_tag
    const breakdownMap = new Map<string, { tokens: number; requests: number }>()
    for (const l of logs) {
      const tag = l.model_tag ?? 'unknown'
      const entry = breakdownMap.get(tag) ?? { tokens: 0, requests: 0 }
      entry.tokens += l.total_tokens ?? 0
      entry.requests += 1
      breakdownMap.set(tag, entry)
    }
    const breakdown = Array.from(breakdownMap.entries()).map(([model_tag, v]) => ({
      model_tag,
      tokens: v.tokens,
      requests: v.requests,
    }))

    // Get quota_remaining from api_keys
    const { data: keyData } = await supabaseAdmin
      .from('api_keys')
      .select('quota_tokens')
      .eq('id', apiKeyId)
      .single()

    const quotaTokens = (keyData as { quota_tokens: number } | null)?.quota_tokens ?? -1
    const quotaRemaining = quotaTokens === -1 ? -1 : Math.max(0, quotaTokens)

    return c.json({
      data: {
        total_tokens: totalTokens,
        total_requests: totalRequests,
        quota_remaining: quotaRemaining,
        breakdown,
      },
    })
  })

  return router
}
