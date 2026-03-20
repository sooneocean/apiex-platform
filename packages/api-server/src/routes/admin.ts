import { Hono } from 'hono'
import { supabaseAdmin } from '../lib/supabase.js'
import { Errors } from '../lib/errors.js'
import { AggregationService } from '../services/AggregationService.js'
import { RatesService } from '../services/RatesService.js'
import { log } from '../lib/logger.js'
import { RouteConfigService } from '../services/RouteConfigService.js'
import type { Period } from '../services/AggregationService.js'
import { KeyService } from '../services/KeyService.js'

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
  const routeConfigSvc = new RouteConfigService()
  const keyService = new KeyService()

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
      log.admin.error('admin_list_users error:', { err: error })
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
      log.admin.error('upsert user_quotas error:', { err: quotaError })
      return Errors.internalError()
    }

    // Update all active keys for this user
    const { data: updatedKeys, error: keysError } = await supabaseAdmin
      .from('api_keys')
      .update({ quota_tokens: body.quota_tokens })
      .eq('user_id', userId)
      .eq('status', 'active')

    if (keysError) {
      log.admin.error('update api_keys quota error:', { err: keysError })
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
      log.admin.error('update api_keys rate_limit_tier error:', { err: keysError })
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
      log.admin.error('topup-logs query error:', { err: error })
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
      log.admin.error('usage-logs query error:', { err: error })
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
      log.admin.error('admin overview error:', { err: err })
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
      log.admin.error('admin latency error:', { err: err })
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
      log.admin.error('admin top-users error:', { err: err })
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
      log.admin.error('admin rates list error:', { err: err })
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
      log.admin.error('admin create rate error:', { err: err })
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
      log.admin.error('admin update rate error:', { err: err })
      return Errors.internalError()
    }
  })

  // ---------------------------------------------------------------------------
  // Admin Models (route_config) endpoints
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/models — List all route_config records (including inactive)
   */
  router.get('/models', async (c) => {
    try {
      const models = await routeConfigSvc.listAll()
      return c.json({ data: models })
    } catch (err) {
      log.admin.error('admin models list error:', { err: err })
      return Errors.internalError()
    }
  })

  /**
   * POST /admin/models — Create a new route_config record
   */
  router.post('/models', async (c) => {
    const body = await c.req.json<{
      tag?: string
      upstream_provider?: string
      upstream_model?: string
      upstream_base_url?: string
      is_active?: boolean
    }>()

    if (!body.tag || typeof body.tag !== 'string' || body.tag.trim() === '') {
      return Errors.invalidParam('tag is required')
    }
    if (!body.upstream_provider || typeof body.upstream_provider !== 'string' || body.upstream_provider.trim() === '') {
      return Errors.invalidParam('upstream_provider is required')
    }
    if (!body.upstream_model || typeof body.upstream_model !== 'string' || body.upstream_model.trim() === '') {
      return Errors.invalidParam('upstream_model is required')
    }
    if (!body.upstream_base_url || typeof body.upstream_base_url !== 'string' || body.upstream_base_url.trim() === '') {
      return Errors.invalidParam('upstream_base_url is required')
    }

    try {
      const model = await routeConfigSvc.create({
        tag: body.tag.trim(),
        upstream_provider: body.upstream_provider.trim(),
        upstream_model: body.upstream_model.trim(),
        upstream_base_url: body.upstream_base_url.trim(),
        is_active: body.is_active,
      })
      return c.json({ data: model }, 201)
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'conflict') {
        return new Response(
          JSON.stringify({
            error: {
              message: `An active route with tag '${body.tag}' already exists.`,
              type: 'invalid_request_error',
              code: 'conflict',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      }
      log.admin.error('admin create model error:', { err: err })
      return Errors.internalError()
    }
  })

  /**
   * PATCH /admin/models/:id — Update an existing route_config record
   */
  router.patch('/models/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<{
      tag?: string
      upstream_provider?: string
      upstream_model?: string
      upstream_base_url?: string
      is_active?: boolean
    }>()

    // Validate at least one field is provided
    const hasUpdate = [
      body.tag,
      body.upstream_provider,
      body.upstream_model,
      body.upstream_base_url,
      body.is_active,
    ].some((v) => v !== undefined)

    if (!hasUpdate) {
      return Errors.invalidParam('At least one field must be provided for update')
    }

    // Validate non-empty string fields if provided
    if (body.tag !== undefined && (typeof body.tag !== 'string' || body.tag.trim() === '')) {
      return Errors.invalidParam('tag must be a non-empty string')
    }
    if (body.upstream_provider !== undefined && (typeof body.upstream_provider !== 'string' || body.upstream_provider.trim() === '')) {
      return Errors.invalidParam('upstream_provider must be a non-empty string')
    }
    if (body.upstream_model !== undefined && (typeof body.upstream_model !== 'string' || body.upstream_model.trim() === '')) {
      return Errors.invalidParam('upstream_model must be a non-empty string')
    }
    if (body.upstream_base_url !== undefined && (typeof body.upstream_base_url !== 'string' || body.upstream_base_url.trim() === '')) {
      return Errors.invalidParam('upstream_base_url must be a non-empty string')
    }

    try {
      const model = await routeConfigSvc.update(id, {
        ...(body.tag !== undefined ? { tag: body.tag.trim() } : {}),
        ...(body.upstream_provider !== undefined ? { upstream_provider: body.upstream_provider.trim() } : {}),
        ...(body.upstream_model !== undefined ? { upstream_model: body.upstream_model.trim() } : {}),
        ...(body.upstream_base_url !== undefined ? { upstream_base_url: body.upstream_base_url.trim() } : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      })
      return c.json({ data: model })
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'not_found') {
        return Errors.notFound()
      }
      if (err instanceof Error && err.message === 'conflict') {
        return new Response(
          JSON.stringify({
            error: {
              message: `An active route with the same tag already exists.`,
              type: 'invalid_request_error',
              code: 'conflict',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      }
      log.admin.error('admin update model error:', { err: err })
      return Errors.internalError()
    }
  })

  // ---------------------------------------------------------------------------
  // Admin Routes (route_config) endpoints — FA-E
  // Alias of /admin/models with additional toggle endpoint
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/routes — List all route_config records (including inactive)
   */
  router.get('/routes', async (c) => {
    try {
      const routes = await routeConfigSvc.listAll()
      return c.json({ data: routes })
    } catch (err) {
      log.admin.error('admin routes list error:', { err: err })
      return Errors.internalError()
    }
  })

  /**
   * POST /admin/routes — Create a new route_config record
   */
  router.post('/routes', async (c) => {
    const body = await c.req.json<{
      tag?: string
      upstream_provider?: string
      upstream_model?: string
      upstream_base_url?: string
      is_active?: boolean
    }>()

    if (!body.tag || typeof body.tag !== 'string' || body.tag.trim() === '') {
      return Errors.invalidParam('tag is required')
    }
    if (!body.upstream_provider || typeof body.upstream_provider !== 'string' || body.upstream_provider.trim() === '') {
      return Errors.invalidParam('upstream_provider is required')
    }
    if (!body.upstream_model || typeof body.upstream_model !== 'string' || body.upstream_model.trim() === '') {
      return Errors.invalidParam('upstream_model is required')
    }
    if (!body.upstream_base_url || typeof body.upstream_base_url !== 'string' || body.upstream_base_url.trim() === '') {
      return Errors.invalidParam('upstream_base_url is required')
    }

    try {
      const route = await routeConfigSvc.create({
        tag: body.tag.trim(),
        upstream_provider: body.upstream_provider.trim(),
        upstream_model: body.upstream_model.trim(),
        upstream_base_url: body.upstream_base_url.trim(),
        is_active: body.is_active,
      })
      return c.json({ data: route }, 201)
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'conflict') {
        return new Response(
          JSON.stringify({
            error: {
              message: `An active route with tag '${body.tag}' already exists.`,
              type: 'invalid_request_error',
              code: 'conflict',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      }
      log.admin.error('admin create route error:', { err: err })
      return Errors.internalError()
    }
  })

  /**
   * PATCH /admin/routes/:id — Partial update of an existing route_config record
   */
  router.patch('/routes/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<{
      tag?: string
      upstream_provider?: string
      upstream_model?: string
      upstream_base_url?: string
      is_active?: boolean
    }>()

    const hasUpdate = [
      body.tag,
      body.upstream_provider,
      body.upstream_model,
      body.upstream_base_url,
      body.is_active,
    ].some((v) => v !== undefined)

    if (!hasUpdate) {
      return Errors.invalidParam('At least one field must be provided for update')
    }

    if (body.tag !== undefined && (typeof body.tag !== 'string' || body.tag.trim() === '')) {
      return Errors.invalidParam('tag must be a non-empty string')
    }
    if (body.upstream_provider !== undefined && (typeof body.upstream_provider !== 'string' || body.upstream_provider.trim() === '')) {
      return Errors.invalidParam('upstream_provider must be a non-empty string')
    }
    if (body.upstream_model !== undefined && (typeof body.upstream_model !== 'string' || body.upstream_model.trim() === '')) {
      return Errors.invalidParam('upstream_model must be a non-empty string')
    }
    if (body.upstream_base_url !== undefined && (typeof body.upstream_base_url !== 'string' || body.upstream_base_url.trim() === '')) {
      return Errors.invalidParam('upstream_base_url must be a non-empty string')
    }

    try {
      const route = await routeConfigSvc.update(id, {
        ...(body.tag !== undefined ? { tag: body.tag.trim() } : {}),
        ...(body.upstream_provider !== undefined ? { upstream_provider: body.upstream_provider.trim() } : {}),
        ...(body.upstream_model !== undefined ? { upstream_model: body.upstream_model.trim() } : {}),
        ...(body.upstream_base_url !== undefined ? { upstream_base_url: body.upstream_base_url.trim() } : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      })
      return c.json({ data: route })
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'not_found') {
        return Errors.notFound()
      }
      if (err instanceof Error && err.message === 'conflict') {
        return new Response(
          JSON.stringify({
            error: {
              message: `An active route with the same tag already exists.`,
              type: 'invalid_request_error',
              code: 'conflict',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      }
      log.admin.error('admin update route error:', { err: err })
      return Errors.internalError()
    }
  })

  /**
   * PATCH /admin/routes/:id/toggle — Toggle is_active for a route_config record.
   * If toggling to inactive and this is the last active route for the same tag,
   * the operation is still allowed but response includes warning: "last_active_route".
   */
  router.patch('/routes/:id/toggle', async (c) => {
    const id = c.req.param('id')

    // Fetch current record
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('route_config')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) {
      return Errors.notFound()
    }

    const nextActive = !current.is_active
    let warning: string | undefined

    // If disabling, check whether it's the last active route for this tag
    if (current.is_active && nextActive === false) {
      const { data: activeRoutes } = await supabaseAdmin
        .from('route_config')
        .select('id')
        .eq('tag', current.tag)
        .eq('is_active', true)

      if (activeRoutes && activeRoutes.length <= 1) {
        warning = 'last_active_route'
      }
    }

    try {
      const updated = await routeConfigSvc.update(id, { is_active: nextActive })
      const responseBody: { data: typeof updated; warning?: string } = { data: updated }
      if (warning) responseBody.warning = warning
      return c.json(responseBody)
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'not_found') {
        return Errors.notFound()
      }
      log.admin.error('admin toggle route error:', { err: err })
      return Errors.internalError()
    }
  })


  // ---------------------------------------------------------------------------
  // Admin Spend endpoints
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/keys/:id/spend — Get spend info for a specific API key
   */
  router.get('/keys/:id/spend', async (c) => {
    const keyId = c.req.param('id')

    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, name, prefix, user_id, status, spend_limit_usd, spent_usd')
      .eq('id', keyId)
      .single()

    if (error || !data) {
      return Errors.notFound()
    }

    return c.json({
      data: {
        id: data.id,
        name: data.name,
        key_prefix: data.prefix,
        user_id: data.user_id,
        status: data.status,
        spend_limit_usd: data.spend_limit_usd,
        spent_usd: data.spent_usd,
      },
    })
  })

  /**
   * PATCH /admin/keys/:id/spend-limit — Set the spend limit for an API key
   */
  router.patch('/keys/:id/spend-limit', async (c) => {
    const keyId = c.req.param('id')
    const body = await c.req.json<{ spend_limit_usd?: number }>().catch(() => ({}))

    if (
      body.spend_limit_usd === undefined ||
      typeof body.spend_limit_usd !== 'number' ||
      !Number.isInteger(body.spend_limit_usd) ||
      body.spend_limit_usd < -1
    ) {
      return Errors.invalidParam('spend_limit_usd must be an integer >= -1 (-1 means unlimited).')
    }

    // Verify key exists
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('api_keys')
      .select('id, spent_usd')
      .eq('id', keyId)
      .single()

    if (fetchErr || !existing) {
      return Errors.notFound()
    }

    const { error } = await supabaseAdmin
      .from('api_keys')
      .update({ spend_limit_usd: body.spend_limit_usd })
      .eq('id', keyId)

    if (error) {
      log.admin.error('admin set spend-limit error:', { err: error })
      return Errors.internalError()
    }

    return c.json({
      data: {
        id: keyId,
        spend_limit_usd: body.spend_limit_usd,
        spent_usd: existing.spent_usd,
      },
    })
  })

  /**
   * POST /admin/keys/:id/reset-spend — Reset the spend counter for an API key
   */
  router.post('/keys/:id/reset-spend', async (c) => {
    const keyId = c.req.param('id')

    // Verify key exists and get current spend_limit_usd
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('api_keys')
      .select('id, spend_limit_usd')
      .eq('id', keyId)
      .single()

    if (fetchErr || !existing) {
      return Errors.notFound()
    }

    try {
      await keyService.resetSpend(keyId)
    } catch (err) {
      log.admin.error('admin reset-spend error:', { err: err })
      return Errors.internalError()
    }

    return c.json({
      data: {
        id: keyId,
        spent_usd: 0,
        spend_limit_usd: existing.spend_limit_usd,
        message: 'Spend counter reset successfully',
      },
    })
  })

  // ---------------------------------------------------------------------------
  // Admin Webhooks endpoints
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/webhooks — List all webhook_configs (paginated), excludes secret field
   */
  router.get('/webhooks', async (c) => {
    const page = Number(c.req.query('page') ?? '1')
    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 100)

    const { data, error, count } = await supabaseAdmin
      .from('webhook_configs')
      .select('id, user_id, url, events, is_active, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) {
      log.admin.error('admin webhooks list error:', { err: error })
      return Errors.internalError()
    }

    return c.json({
      data: data ?? [],
      pagination: { page, limit, total: count ?? 0 },
    })
  })

  // ---------------------------------------------------------------------------
  // Admin Rate Limits endpoints
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/rate-limits/tiers — List all tiers
   */
  router.get('/rate-limits/tiers', async (c) => {
    const { data, error } = await supabaseAdmin
      .from('rate_limit_tiers')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      log.admin.error('list tiers error:', { err: error })
      return Errors.internalError()
    }
    return c.json({ data: data ?? [] })
  })

  /**
   * POST /admin/rate-limits/tiers — Create a new tier
   */
  router.post('/rate-limits/tiers', async (c) => {
    const body = await c.req.json<{ tier?: string; rpm?: number; tpm?: number }>()

    if (!body.tier || typeof body.tier !== 'string' || body.tier.trim() === '') {
      return Errors.invalidParam('tier is required')
    }
    if (body.rpm == null || typeof body.rpm !== 'number' || !Number.isInteger(body.rpm) || body.rpm < -1) {
      return Errors.invalidParam('rpm must be an integer >= -1')
    }
    if (body.tpm == null || typeof body.tpm !== 'number' || !Number.isInteger(body.tpm) || body.tpm < -1) {
      return Errors.invalidParam('tpm must be an integer >= -1')
    }

    const { data, error } = await supabaseAdmin
      .from('rate_limit_tiers')
      .insert({ tier: body.tier.trim(), rpm: body.rpm, tpm: body.tpm })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return c.json(
          { error: { message: `Tier '${body.tier}' already exists.`, type: 'invalid_request_error', code: 'conflict' } },
          409
        )
      }
      log.admin.error('create tier error:', { err: error })
      return Errors.internalError()
    }

    return c.json({ data }, 201)
  })

  /**
   * PATCH /admin/rate-limits/tiers/:tier — Update a tier
   */
  router.patch('/rate-limits/tiers/:tier', async (c) => {
    const tier = c.req.param('tier')
    const body = await c.req.json<{ rpm?: number; tpm?: number }>()

    if (body.rpm === undefined && body.tpm === undefined) {
      return Errors.invalidParam('At least one of rpm or tpm must be provided')
    }
    if (body.rpm !== undefined && (typeof body.rpm !== 'number' || !Number.isInteger(body.rpm) || body.rpm < -1)) {
      return Errors.invalidParam('rpm must be an integer >= -1')
    }
    if (body.tpm !== undefined && (typeof body.tpm !== 'number' || !Number.isInteger(body.tpm) || body.tpm < -1)) {
      return Errors.invalidParam('tpm must be an integer >= -1')
    }

    const updates: Record<string, number> = {}
    if (body.rpm !== undefined) updates.rpm = body.rpm
    if (body.tpm !== undefined) updates.tpm = body.tpm

    const { data, error } = await supabaseAdmin
      .from('rate_limit_tiers')
      .update(updates)
      .eq('tier', tier)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return Errors.notFound()
      }
      log.admin.error('update tier error:', { err: error })
      return Errors.internalError()
    }

    if (!data) {
      return Errors.notFound()
    }

    return c.json({ data })
  })

  /**
   * DELETE /admin/rate-limits/tiers/:tier — Delete a tier
   */
  router.delete('/rate-limits/tiers/:tier', async (c) => {
    const tier = c.req.param('tier')

    // Verify tier exists
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('rate_limit_tiers')
      .select('tier')
      .eq('tier', tier)
      .single()

    if (fetchError || !existing) {
      return Errors.notFound()
    }

    // Check if any active api_keys reference this tier
    const { count, error: countError } = await supabaseAdmin
      .from('api_keys')
      .select('id', { count: 'exact', head: true })
      .eq('rate_limit_tier', tier)
      .eq('status', 'active')

    if (countError) {
      log.admin.error('check tier usage error:', { err: countError })
      return Errors.internalError()
    }

    if (count && count > 0) {
      return c.json(
        {
          error: {
            message: `Cannot delete tier '${tier}': ${count} API key(s) are still using this tier.`,
            type: 'invalid_request_error',
            code: 'conflict',
          },
        },
        409
      )
    }

    const { error: deleteError } = await supabaseAdmin
      .from('rate_limit_tiers')
      .delete()
      .eq('tier', tier)

    if (deleteError) {
      log.admin.error('delete tier error:', { err: deleteError })
      return Errors.internalError()
    }

    return c.json({ data: { tier, deleted: true } })
  })

  /**
   * GET /admin/rate-limits/overrides — List all model overrides (optional ?tier= filter)
   */
  router.get('/rate-limits/overrides', async (c) => {
    let query = supabaseAdmin
      .from('model_rate_overrides')
      .select('*')
      .order('created_at', { ascending: true })

    const tierFilter = c.req.query('tier')
    if (tierFilter) query = query.eq('tier', tierFilter)

    const { data, error } = await query
    if (error) {
      log.admin.error('list overrides error:', { err: error })
      return Errors.internalError()
    }
    return c.json({ data: data ?? [] })
  })

  /**
   * POST /admin/rate-limits/overrides — Create a new model override
   */
  router.post('/rate-limits/overrides', async (c) => {
    const body = await c.req.json<{ tier?: string; model_tag?: string; rpm?: number; tpm?: number }>()

    if (!body.tier || typeof body.tier !== 'string' || body.tier.trim() === '') {
      return Errors.invalidParam('tier is required')
    }
    if (!body.model_tag || typeof body.model_tag !== 'string' || body.model_tag.trim() === '') {
      return Errors.invalidParam('model_tag is required')
    }
    if (body.rpm == null || typeof body.rpm !== 'number' || !Number.isInteger(body.rpm) || body.rpm < -1) {
      return Errors.invalidParam('rpm must be an integer >= -1')
    }
    if (body.tpm == null || typeof body.tpm !== 'number' || !Number.isInteger(body.tpm) || body.tpm < -1) {
      return Errors.invalidParam('tpm must be an integer >= -1')
    }

    // Validate tier exists
    const { data: tierData, error: tierError } = await supabaseAdmin
      .from('rate_limit_tiers')
      .select('tier')
      .eq('tier', body.tier.trim())
      .single()

    if (tierError || !tierData) {
      return Errors.notFound()
    }

    const { data, error } = await supabaseAdmin
      .from('model_rate_overrides')
      .insert({ tier: body.tier.trim(), model_tag: body.model_tag.trim(), rpm: body.rpm, tpm: body.tpm })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return c.json(
          {
            error: {
              message: `Override for tier '${body.tier}' + model '${body.model_tag}' already exists.`,
              type: 'invalid_request_error',
              code: 'conflict',
            },
          },
          409
        )
      }
      log.admin.error('create override error:', { err: error })
      return Errors.internalError()
    }

    return c.json({ data }, 201)
  })

  /**
   * PATCH /admin/rate-limits/overrides/:id — Update a model override
   */
  router.patch('/rate-limits/overrides/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<{ rpm?: number; tpm?: number }>()

    if (body.rpm === undefined && body.tpm === undefined) {
      return Errors.invalidParam('At least one of rpm or tpm must be provided')
    }
    if (body.rpm !== undefined && (typeof body.rpm !== 'number' || !Number.isInteger(body.rpm) || body.rpm < -1)) {
      return Errors.invalidParam('rpm must be an integer >= -1')
    }
    if (body.tpm !== undefined && (typeof body.tpm !== 'number' || !Number.isInteger(body.tpm) || body.tpm < -1)) {
      return Errors.invalidParam('tpm must be an integer >= -1')
    }

    const updates: Record<string, number> = {}
    if (body.rpm !== undefined) updates.rpm = body.rpm
    if (body.tpm !== undefined) updates.tpm = body.tpm

    const { data, error } = await supabaseAdmin
      .from('model_rate_overrides')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return Errors.notFound()
      }
      log.admin.error('update override error:', { err: error })
      return Errors.internalError()
    }

    if (!data) {
      return Errors.notFound()
    }

    return c.json({ data })
  })

  /**
   * DELETE /admin/rate-limits/overrides/:id — Delete a model override
   */
  router.delete('/rate-limits/overrides/:id', async (c) => {
    const id = c.req.param('id')

    // Verify override exists
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('model_rate_overrides')
      .select('id')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return Errors.notFound()
    }

    const { error: deleteError } = await supabaseAdmin
      .from('model_rate_overrides')
      .delete()
      .eq('id', id)

    if (deleteError) {
      log.admin.error('delete override error:', { err: deleteError })
      return Errors.internalError()
    }

    return c.json({ data: { id, deleted: true } })
  })

  return router
}
