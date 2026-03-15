import { Hono } from 'hono'
import { Errors } from '../lib/errors.js'
import { AggregationService } from '../services/AggregationService.js'
import { supabaseAdmin } from '../lib/supabase.js'
import type { Period } from '../services/AggregationService.js'

const VALID_PERIODS: Period[] = ['24h', '7d', '30d']

function validatePeriod(raw: string | undefined): Period | null {
  if (!raw) return '7d'
  if ((VALID_PERIODS as string[]).includes(raw)) return raw as Period
  return null
}

/**
 * User analytics routes — all require supabaseJwtAuth (applied in index.ts).
 */
export function analyticsRoutes() {
  const router = new Hono()
  const svc = new AggregationService()

  /**
   * GET /analytics/timeseries
   * Query params: period (24h|7d|30d), key_id (optional)
   */
  router.get('/timeseries', async (c) => {
    const userId = c.get('userId') as string
    const periodRaw = c.req.query('period')
    const keyId = c.req.query('key_id')

    const period = validatePeriod(periodRaw)
    if (!period) {
      return Errors.invalidParam('period must be one of: 24h, 7d, 30d')
    }

    // Validate key_id ownership if provided
    if (keyId) {
      const owned = await verifyKeyOwnership(userId, keyId)
      if (!owned) return Errors.invalidParam('key_id does not belong to the current user')
    }

    try {
      const result = await svc.getTimeseries({ period, userId: keyId ? undefined : userId, keyId })
      return c.json({ data: result })
    } catch (err) {
      if (err instanceof Error && err.message.includes('statement_timeout')) {
        return Errors.gatewayTimeout()
      }
      console.error('timeseries error:', err)
      return Errors.internalError()
    }
  })

  /**
   * GET /analytics/model-breakdown
   * Query params: period (24h|7d|30d), key_id (optional)
   */
  router.get('/model-breakdown', async (c) => {
    const userId = c.get('userId') as string
    const periodRaw = c.req.query('period')
    const keyId = c.req.query('key_id')

    const period = validatePeriod(periodRaw)
    if (!period) {
      return Errors.invalidParam('period must be one of: 24h, 7d, 30d')
    }

    if (keyId) {
      const owned = await verifyKeyOwnership(userId, keyId)
      if (!owned) return Errors.invalidParam('key_id does not belong to the current user')
    }

    try {
      const result = await svc.getModelBreakdown({ period, userId: keyId ? undefined : userId, keyId })
      return c.json({ data: result })
    } catch (err) {
      if (err instanceof Error && err.message.includes('statement_timeout')) {
        return Errors.gatewayTimeout()
      }
      console.error('model-breakdown error:', err)
      return Errors.internalError()
    }
  })

  /**
   * GET /analytics/latency
   * Query params: period (24h|7d|30d), key_id (optional)
   */
  router.get('/latency', async (c) => {
    const userId = c.get('userId') as string
    const periodRaw = c.req.query('period')
    const keyId = c.req.query('key_id')

    const period = validatePeriod(periodRaw)
    if (!period) {
      return Errors.invalidParam('period must be one of: 24h, 7d, 30d')
    }

    if (keyId) {
      const owned = await verifyKeyOwnership(userId, keyId)
      if (!owned) return Errors.invalidParam('key_id does not belong to the current user')
    }

    try {
      const result = await svc.getLatencyTimeseries({ period, userId: keyId ? undefined : userId, keyId })
      return c.json({ data: result })
    } catch (err) {
      if (err instanceof Error && err.message.includes('statement_timeout')) {
        return Errors.gatewayTimeout()
      }
      console.error('latency error:', err)
      return Errors.internalError()
    }
  })

  /**
   * GET /analytics/billing
   * Query params: period (24h|7d|30d) — defaults to 30d for billing
   */
  router.get('/billing', async (c) => {
    const userId = c.get('userId') as string
    const periodRaw = c.req.query('period')

    const period = validatePeriod(periodRaw) ?? '30d'

    try {
      const result = await svc.getBillingSummary({ userId, period })
      return c.json({ data: result })
    } catch (err) {
      if (err instanceof Error && err.message.includes('statement_timeout')) {
        return Errors.gatewayTimeout()
      }
      console.error('billing error:', err)
      return Errors.internalError()
    }
  })

  return router
}

/**
 * Verify that a given key_id belongs to the specified userId.
 */
async function verifyKeyOwnership(userId: string, keyId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id')
    .eq('id', keyId)
    .eq('user_id', userId)
    .single()

  if (error || !data) return false
  return true
}
