import { Hono } from 'hono'
import { supabaseAdmin } from '../lib/supabase.js'
import { Errors } from '../lib/errors.js'

/**
 * Admin routes — all routes expect userId + admin role to be verified by parent middleware.
 */
export function adminRoutes() {
  const router = new Hono()

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
      return Errors.unsupportedModel('quota_tokens must be >= -1')
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
      query = query.eq('user_id', userId)
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

  return router
}
