import { Hono } from 'hono'
import { supabaseAdmin } from '../lib/supabase.js'
import { Errors } from '../lib/errors.js'
import { AggregationService } from '../services/AggregationService.js'
import { RatesService } from '../services/RatesService.js'
import type { Period } from '../services/AggregationService.js'

const VALID_PERIODS: Period[] = ['24h', '7d', '30d']

function validatePeriod(raw: string | undefined): Period | null {
  if (!raw) return '7d'
  if ((VALID_PERIODS as string[]).includes(raw)) return raw as Period
  return null
}

/**
 * Admin routes — all routes expect userId + admin role to be verified by parent middleware.
 */
export function adminRoutes() {
  const router = new Hono()
  const aggregationSvc = new AggregationService()
  const ratesSvc = new RatesService()

  /**
   * GET /admin/users — List all users with quota info
   */
  router.get('/users', async (c) => {
    const page = Number(c.req.query('page') ?? '1')
    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 100)

    const { data, error, count } = await supabaseAdmin.rpc('admin_list_users', {
      p_offset: (page - 1) * limit,
      p_limit: limit,
    })

    if (error) {
      console.error('admin_list_users error:', error)
      return Errors.internalError()
    }

    return c.json({
      data: data ?? [],
      pagination: { page, limit, total: count ?? (data?.length ?? 0) },
    })
  })

  /**
   * PATCH /admin/users/:id/quota — Set user quota
   */
  router.patch('/users/:id/quota', async (c) => {
    const userId = c.req.param('id')
    const adminId = c.get('userId') as string
    const body = await c.req.json<{ quota_tokens: number }>()

    if (body.quota_tokens < -1) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'quota_tokens must be >= -1',
            type: 'invalid_request_error',
            code: 'invalid_parameter',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Upsert user_quotas
    const { error: quotaError } = await supabaseAdmin
      .from('user_quotas')
      .upsert({
        user_id: userId,
        default_quota_tokens: body.quota_tokens,
        updated_at: new Date().toISOString(),
        updated_by: adminId,
      })
      .select()
      .single()

    if (quotaError) {
      console.error('upsert user_quotas error:', quotaError)
      return Errors.internalError()
    }

    // Update all active keys for this user
    const { data: updatedKeys, error: keysError } = await supabaseAdmin
      .from('api_keys')
      .update({ quota_tokens: body.quota_tokens })
      .eq('user_id', userId)
      .eq('status', 'active')

    if (keysError) {
      console.error('update api_keys quota error:', keysError)
    }

    return c.json({
      data: {
        user_id: userId,
        updated_keys: updatedKeys?.length ?? 0,
        quota_tokens: body.quota_tokens,
      },
    })
  })

  /**
   * PATCH /admin/users/:id/rate-limit — Set user rate limit tier
   */
  router.patch('/users/:id/rate-limit', async (c) => {
    const userId = c.req.param('id')
    const body = await c.req.json<{ tier: string }>()

    // Validate tier exists
    const { data: tierData, error: tierError } = await supabaseAdmin
      .from('rate_limit_tiers')
      .select('tier')
      .eq('tier', body.tier)
      .single()

    if (tierError || !tierData) {
      return Errors.invalidPlan()
    }

    // Update all active keys for this user
    const { data: updatedKeys, error: keysError } = await supabaseAdmin
      .from('api_keys')
      .update({ rate_limit_tier: body.tier })
      .eq('user_id', userId)
      .eq('status', 'active')

    if (keysError) {
      console.error('update api_keys rate_limit_tier error:', keysError)
      return Errors.internalError()
    }

    return c.json({
      data: { user_id: userId, updated_keys: (updatedKeys as unknown[] | null)?.length ?? 0, tier: body.tier }
    })
  })

  /**
   * GET /admin/topup-logs — Query topup logs with optional user filter
   */
  router.get('/topup-logs', async (c) => {
    const page = Number(c.req.query('page') ?? '1')
    const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200)
    const userId = c.req.query('user_id')

    let query = supabaseAdmin
      .from('topup_logs')
      .select('*', { count: 'exact' })

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) {
      console.error('topup-logs query error:', error)
      return Errors.internalError()
    }

    return c.json({
      data: data ?? [],
      pagination: { page, limit, total: count ?? 0 },
    })
  })

  /**
   * GET /admin/usage-logs — Query usage logs with filters
   */
  router.get('/usage-logs', async (c) => {
    const page = Number(c.req.query('page') ?? '1')
    const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200)
    const userId = c.req.query('user_id')
    const modelTag = c.req.query('model_tag')
    const from = c.req.query('from')
    const to = c.req.query('to')

    let query = supabaseAdmin
      .from('usage_logs')
      .select('*', { count: 'exact' })

    if (userId) {
      // usage_logs has no user_id column — filter via api_keys join
      const { data: userKeys } = await supabaseAdmin
        .from('api_keys')
        .select('id')
        .eq('user_id', userId)
      const keyIds = (userKeys ?? []).map((k: { id: string }) => k.id)
      if (keyIds.length === 0) {
        return c.json({ data: [], pagination: { page, limit, total: 0 } })
      }
      query = query.in('api_key_id', keyIds)
    }
    if (modelTag) {
      query = query.eq('model_tag', modelTag)
    }
    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      query = query.lte('created_at', to)
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) {
      console.error('usage-logs query error:', error)
      return Errors.internalError()
    }

    return c.json({
      data: data ?? [],
      pagination: { page, limit, total: count ?? 0 },
    })
  })

  // ---------------------------------------------------------------------------
  // Admin Analytics endpoints
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/analytics/overview — Platform-wide overview stats
   */
  router.get('/analytics/overview', async (c) => {
    const periodRaw = c.req.query('period')
    const period = validatePeriod(periodRaw)
    if (!period) return Errors.invalidParam('period must be one of: 24h, 7d, 30d')

    try {
      const result = await aggregationSvc.getOverview(period)
      return c.json({ data: result })
    } catch (err) {
      if (err instanceof Error && err.message.includes('statement_timeout')) {
        return Errors.gatewayTimeout()
      }
      console.error('admin overview error:', err)
      return Errors.internalError()
    }
  })

  /**
   * GET /admin/analytics/latency — Platform-wide latency percentiles by model
   */
  router.get('/analytics/latency', async (c) => {
    const periodRaw = c.req.query('period')
    const period = validatePeriod(periodRaw)
    if (!period) return Errors.invalidParam('period must be one of: 24h, 7d, 30d')

    try {
      const result = await aggregationSvc.getLatencyTimeseries({ period })
      return c.json({ data: result })
    } catch (err) {
      if (err instanceof Error && err.message.includes('statement_timeout')) {
        return Errors.gatewayTimeout()
      }
      console.error('admin latency error:', err)
      return Errors.internalError()
    }
  })

  /**
   * GET /admin/analytics/top-users — Top users by token consumption
   */
  router.get('/analytics/top-users', async (c) => {
    const periodRaw = c.req.query('period')
    const period = validatePeriod(periodRaw)
    if (!period) return Errors.invalidParam('period must be one of: 24h, 7d, 30d')
    const limitRaw = c.req.query('limit')
    const limit = limitRaw ? Math.min(Number(limitRaw), 50) : 10

    try {
      const result = await aggregationSvc.getTopUsers(period, limit)
      return c.json({ data: result })
    } catch (err) {
      if (err instanceof Error && err.message.includes('statement_timeout')) {
        return Errors.gatewayTimeout()
      }
      console.error('admin top-users error:', err)
      return Errors.internalError()
    }
  })

  // ---------------------------------------------------------------------------
  // Admin Rates endpoints
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/rates — List all model rates
   */
  router.get('/rates', async (c) => {
    try {
      const rates = await ratesSvc.listRates()
      return c.json({ data: rates })
    } catch (err) {
      console.error('admin rates list error:', err)
      return Errors.internalError()
    }
  })

  /**
   * POST /admin/rates — Create a new model rate
   */
  router.post('/rates', async (c) => {
    const body = await c.req.json<{
      model_tag?: string
      input_rate_per_1k?: number
      output_rate_per_1k?: number
      effective_from?: string
    }>()

    if (!body.model_tag || typeof body.model_tag !== 'string' || body.model_tag.trim() === '') {
      return Errors.invalidParam('model_tag is required')
    }
    if (body.input_rate_per_1k == null || typeof body.input_rate_per_1k !== 'number' || body.input_rate_per_1k < 0) {
      return Errors.invalidParam('input_rate_per_1k is required and must be >= 0')
    }
    if (body.output_rate_per_1k == null || typeof body.output_rate_per_1k !== 'number' || body.output_rate_per_1k < 0) {
      return Errors.invalidParam('output_rate_per_1k is required and must be >= 0')
    }

    try {
      const rate = await ratesSvc.createRate({
        model_tag: body.model_tag.trim(),
        input_rate_per_1k: body.input_rate_per_1k,
        output_rate_per_1k: body.output_rate_per_1k,
        effective_from: body.effective_from,
      })
      return c.json({ data: rate }, 201)
    } catch (err) {
      console.error('admin create rate error:', err)
      return Errors.internalError()
    }
  })

  /**
   * PATCH /admin/rates/:id — Update an existing model rate
   */
  router.patch('/rates/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<{
      input_rate_per_1k?: number
      output_rate_per_1k?: number
      effective_from?: string
    }>()

    if (body.input_rate_per_1k !== undefined && (typeof body.input_rate_per_1k !== 'number' || body.input_rate_per_1k < 0)) {
      return Errors.invalidParam('input_rate_per_1k must be >= 0')
    }
    if (body.output_rate_per_1k !== undefined && (typeof body.output_rate_per_1k !== 'number' || body.output_rate_per_1k < 0)) {
      return Errors.invalidParam('output_rate_per_1k must be >= 0')
    }

    try {
      const rate = await ratesSvc.updateRate(id, {
        ...(body.input_rate_per_1k !== undefined ? { input_rate_per_1k: body.input_rate_per_1k } : {}),
        ...(body.output_rate_per_1k !== undefined ? { output_rate_per_1k: body.output_rate_per_1k } : {}),
        ...(body.effective_from !== undefined ? { effective_from: body.effective_from } : {}),
      })
      return c.json({ data: rate })
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'not_found') {
        return Errors.notFound()
      }
      console.error('admin update rate error:', err)
      return Errors.internalError()
    }
  })

  return router
}
