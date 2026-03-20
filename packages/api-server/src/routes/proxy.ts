import { Hono } from 'hono'
import { stream as honoStream } from 'hono/streaming'
import { trace, SpanStatusCode } from '@opentelemetry/api'
import { RouterService } from '../services/RouterService.js'
import { KeyService } from '../services/KeyService.js'
import { RatesService } from '../services/RatesService.js'
import { UsageLogger } from '../services/UsageLogger.js'
import { WebhookService } from '../services/WebhookService.js'
import { InsufficientQuotaError, Errors } from '../lib/errors.js'
import type { OpenAIRequest } from '../adapters/types.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { rateLimiter } from '../lib/RateLimiter.js'
import { log } from '../lib/logger.js'

const tracer = trace.getTracer('api-server', '0.1.0')

/**
 * Supported model tags (OpenAI-compat aliases).
 * Only models with the `apex-` prefix are accepted at the gateway level.
 * Everything else returns 400 immediately without touching the database.
 */
function isSupportedModel(model: string): boolean {
  return model.startsWith('apex-')
}

/** Fire-and-forget post-processing after a proxy request completes. */
async function finalizeUsage(opts: {
  keyService: KeyService
  ratesService: RatesService
  usageLogger: UsageLogger
  webhookService: WebhookService
  apiKeyId: string
  userId: string
  estimatedTokens: number
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  route: { tag: string; upstream_model: string }
  latencyMs: number
  status: 'success' | 'error'
  model: string
}) {
  const { keyService, ratesService, usageLogger, webhookService } = opts
  const { apiKeyId, userId, estimatedTokens, usage, route, latencyMs, status, model } = opts

  // Settle quota
  keyService.settleQuota(apiKeyId, estimatedTokens, usage.total_tokens).catch((err) => log.proxy.error('fire-and-forget failed', { err }))

  // Rate limiter
  rateLimiter.record(apiKeyId, usage.total_tokens, model)

  // Log usage
  usageLogger.logUsage({
    apiKeyId,
    modelTag: route.tag,
    upstreamModel: route.upstream_model,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    latencyMs,
    status,
  }).catch((err) => log.proxy.error('fire-and-forget failed', { err }))

  // Record spend + notify (only on success with actual tokens)
  if (status === 'success' && usage.total_tokens > 0) {
    try {
      const rate = await ratesService.getEffectiveRate(route.tag, new Date())
      if (rate) {
        const costCents = Math.round(
          (usage.prompt_tokens / 1000) * rate.input_rate_per_1k * 100 +
          (usage.completion_tokens / 1000) * rate.output_rate_per_1k * 100
        )
        await keyService.recordSpend(apiKeyId, costCents)
        webhookService.checkAndNotifySpend(userId, apiKeyId).catch((err) => log.proxy.error('webhook notification failed', { err }))
      }
    } catch (err) {
      log.proxy.error('fire-and-forget failed', { err })
    }

    // Quota notification
    webhookService.checkAndNotifyQuota(userId, apiKeyId).catch((err) => log.proxy.error('webhook notification failed', { err }))
  }
}

export function proxyRoutes() {
  const router = new Hono()
  const routerService = new RouterService()
  const keyService = new KeyService()
  const ratesService = new RatesService()
  const usageLogger = new UsageLogger()
  const webhookService = new WebhookService()

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
    const userId = c.get('userId') as string
    const apiKeyRecord = c.get('apiKey') as Record<string, unknown>
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
      keyService.settleQuota(apiKeyId, estimatedTokens, 0).catch((err) => log.proxy.error('fire-and-forget failed', { err }))
      return Errors.spendLimitExceeded()
    }

    // Step 5 — resolve route (503 if not configured, with quota refund)
    let route
    try {
      route = await routerService.resolveRoute(body.model)
    } catch {
      // Route not configured — refund reserved quota and return 503
      keyService.settleQuota(apiKeyId, estimatedTokens, 0).catch((err) => log.proxy.error('fire-and-forget failed', { err }))
      return Errors.routeNotConfigured()
    }

    // Step 6 — forward to upstream
    const llmSpan = tracer.startSpan('llm.proxy', {
      attributes: {
        'llm.model': route.tag,
        'llm.provider': route.provider,
        'llm.estimated_tokens': estimatedTokens,
        'llm.stream': isStream,
      },
    })
    try {
      const result = await routerService.forward(route, body, isStream)

      if (result.type === 'json') {
        // Non-streaming response
        const latencyMs = Date.now() - startTime
        const usage = result.data.usage

        llmSpan.setAttributes({
          'llm.total_tokens': usage.total_tokens,
          'llm.prompt_tokens': usage.prompt_tokens,
          'llm.completion_tokens': usage.completion_tokens,
          'llm.latency_ms': latencyMs,
        })
        llmSpan.setStatus({ code: SpanStatusCode.OK })
        llmSpan.end()

        // Fire-and-forget post-processing
        finalizeUsage({
          keyService, ratesService, usageLogger, webhookService,
          apiKeyId, userId, estimatedTokens, usage, route, latencyMs,
          status: 'success', model: body.model,
        })

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
          log.proxy.error('stream error', { err })
        } finally {
          // Stream complete — settle quota and log usage
          const latencyMs = Date.now() - startTime
          const usage = result.usage

          llmSpan.setAttributes({
            'llm.total_tokens': usage.total_tokens,
            'llm.prompt_tokens': usage.prompt_tokens,
            'llm.completion_tokens': usage.completion_tokens,
            'llm.latency_ms': latencyMs,
          })
          llmSpan.setStatus({ code: SpanStatusCode.OK })
          llmSpan.end()

          // Fire-and-forget post-processing
          finalizeUsage({
            keyService, ratesService, usageLogger, webhookService,
            apiKeyId, userId, estimatedTokens, usage, route, latencyMs,
            status: 'success', model: body.model,
          })
        }
      })
    } catch (err) {
      // Upstream error — refund full quota + log error
      const latencyMs = Date.now() - startTime
      llmSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
      llmSpan.setAttribute('llm.latency_ms', latencyMs)
      llmSpan.end()
      finalizeUsage({
        keyService, ratesService, usageLogger, webhookService,
        apiKeyId, userId, estimatedTokens,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        route, latencyMs, status: 'error', model: body.model,
      })
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
