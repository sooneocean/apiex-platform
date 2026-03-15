import { supabaseAdmin } from '../lib/supabase.js'
import { RatesService } from './RatesService.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Period = '24h' | '7d' | '30d'
export type Granularity = 'hour' | 'day'

export interface AggregationParams {
  period: Period
  /** Filter to a specific user's keys (requires JOIN api_keys) */
  userId?: string
  /** Filter to a specific key directly */
  keyId?: string
}

export interface TimeseriesPoint {
  timestamp: string
  [modelTag: string]: string | number | Record<string, number>
}

export interface TimeseriesResult {
  period: Period
  granularity: Granularity
  series: TimeseriesPoint[]
  totals: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    total_requests: number
  }
}

export interface ModelBreakdownItem {
  model_tag: string
  total_tokens: number
  total_requests: number
  percentage: number
}

export interface ModelBreakdownResult {
  period: Period
  breakdown: ModelBreakdownItem[]
}

export interface LatencyPoint {
  timestamp: string
  [modelTag: string]: string | { p50: number; p95: number; p99: number }
}

export interface LatencyResult {
  period: Period
  granularity: Granularity
  series: LatencyPoint[]
}

export interface BillingBreakdownItem {
  model_tag: string
  prompt_tokens: number
  completion_tokens: number
  input_cost_usd: number
  output_cost_usd: number
  total_cost_usd: number
  rate: { input_rate_per_1k: number; output_rate_per_1k: number }
}

export interface BillingResult {
  period: Period
  cost: {
    total_usd: number
    breakdown: BillingBreakdownItem[]
  } | null
  quota: {
    total_quota_tokens: number
    is_unlimited: boolean
    estimated_days_remaining: number | null
    daily_avg_consumption: number
  }
  recent_topups: Array<{
    id: string
    amount_usd: number
    tokens_granted: number
    created_at: string
  }>
}

export interface OverviewResult {
  period: Period
  total_tokens: number
  total_requests: number
  active_users: number
  avg_latency_ms: number
  series: TimeseriesPoint[]
}

export interface TopUserItem {
  user_id: string
  email: string
  total_tokens: number
  total_requests: number
  total_cost_usd: number | null
}

export interface TopUsersResult {
  period: Period
  rankings: TopUserItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGranularity(period: Period): Granularity {
  return period === '24h' ? 'hour' : 'day'
}

function getPeriodStart(period: Period): string {
  const now = new Date()
  switch (period) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  }
}

/**
 * Resolve api_key_ids for a given user (or return undefined if no userId/keyId filter).
 * Returns null if user has no keys (caller should return empty result).
 */
async function resolveKeyIds(
  userId?: string,
  keyId?: string
): Promise<string[] | null | undefined> {
  if (keyId) {
    return [keyId]
  }
  if (userId) {
    const { data: userKeys } = await supabaseAdmin
      .from('api_keys')
      .select('id')
      .eq('user_id', userId)
    const ids = (userKeys ?? []).map((k: { id: string }) => k.id)
    return ids.length === 0 ? null : ids
  }
  return undefined // No filter — platform-wide
}

// ---------------------------------------------------------------------------
// AggregationService
// ---------------------------------------------------------------------------

export class AggregationService {
  private ratesService = new RatesService()

  // -------------------------------------------------------------------------
  // Task #4: getTimeseries + getModelBreakdown
  // -------------------------------------------------------------------------

  /**
   * Get token usage timeseries, grouped by DATE_TRUNC + model_tag.
   * Supports per-user (JOIN api_keys), per-key, and platform-wide modes.
   */
  async getTimeseries(params: AggregationParams): Promise<TimeseriesResult> {
    const { period, userId, keyId } = params
    const granularity = getGranularity(period)
    const periodStart = getPeriodStart(period)

    const keyIds = await resolveKeyIds(userId, keyId)
    if (keyIds === null) {
      // User has no keys
      return {
        period,
        granularity,
        series: [],
        totals: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, total_requests: 0 },
      }
    }

    // Build raw SQL via supabase.rpc or use from().select() with filters
    // Since supabase-js doesn't support DATE_TRUNC natively, we use rpc or raw SQL via .rpc
    // We'll use a direct approach: fetch raw and aggregate in JS for simplicity + testability,
    // BUT for real aggregation efficiency we need SQL. Use supabase.rpc with raw SQL.
    // Implementation: use supabaseAdmin.from with a workaround via .select() + manual group.
    // For production-grade aggregation, we use Postgres functions via rpc.
    // Here we implement via parameterized raw SQL using the postgres extension.

    // Use rpc approach with a known function, OR use .from() with JS aggregation for testability.
    // Decision: implement using supabase client chained queries + JS aggregation.
    // This keeps the code testable without needing actual DB functions.

    let query = supabaseAdmin
      .from('usage_logs')
      .select('model_tag, prompt_tokens, completion_tokens, total_tokens, created_at')
      .gte('created_at', periodStart)
      .order('created_at', { ascending: true })

    if (keyIds !== undefined) {
      query = query.in('api_key_id', keyIds)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`getTimeseries failed: ${error.message}`)
    }

    const rows = data ?? []

    // Aggregate in-memory by (truncated timestamp, model_tag)
    const buckets = new Map<string, Map<string, { prompt_tokens: number; completion_tokens: number; total_tokens: number; requests: number }>>()

    for (const row of rows) {
      const date = new Date(row.created_at)
      let bucketKey: string
      if (granularity === 'hour') {
        date.setMinutes(0, 0, 0)
        bucketKey = date.toISOString()
      } else {
        date.setHours(0, 0, 0, 0)
        bucketKey = date.toISOString()
      }

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, new Map())
      }
      const bucket = buckets.get(bucketKey)!
      if (!bucket.has(row.model_tag)) {
        bucket.set(row.model_tag, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, requests: 0 })
      }
      const entry = bucket.get(row.model_tag)!
      entry.prompt_tokens += row.prompt_tokens ?? 0
      entry.completion_tokens += row.completion_tokens ?? 0
      entry.total_tokens += row.total_tokens ?? 0
      entry.requests += 1
    }

    const series: TimeseriesPoint[] = []
    for (const [timestamp, modelMap] of Array.from(buckets.entries()).sort()) {
      const point: TimeseriesPoint = { timestamp }
      for (const [modelTag, stats] of modelMap.entries()) {
        point[modelTag] = stats
      }
      series.push(point)
    }

    // Compute totals
    const totals = rows.reduce(
      (acc, row) => {
        acc.prompt_tokens += row.prompt_tokens ?? 0
        acc.completion_tokens += row.completion_tokens ?? 0
        acc.total_tokens += row.total_tokens ?? 0
        acc.total_requests += 1
        return acc
      },
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, total_requests: 0 }
    )

    return { period, granularity, series, totals }
  }

  /**
   * Get model breakdown (distribution by model_tag) for a given period.
   */
  async getModelBreakdown(params: AggregationParams): Promise<ModelBreakdownResult> {
    const { period, userId, keyId } = params
    const periodStart = getPeriodStart(period)

    const keyIds = await resolveKeyIds(userId, keyId)
    if (keyIds === null) {
      return { period, breakdown: [] }
    }

    let query = supabaseAdmin
      .from('usage_logs')
      .select('model_tag, total_tokens')
      .gte('created_at', periodStart)

    if (keyIds !== undefined) {
      query = query.in('api_key_id', keyIds)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`getModelBreakdown failed: ${error.message}`)
    }

    const rows = data ?? []
    const modelTotals = new Map<string, { total_tokens: number; total_requests: number }>()

    for (const row of rows) {
      if (!modelTotals.has(row.model_tag)) {
        modelTotals.set(row.model_tag, { total_tokens: 0, total_requests: 0 })
      }
      const entry = modelTotals.get(row.model_tag)!
      entry.total_tokens += row.total_tokens ?? 0
      entry.total_requests += 1
    }

    const grandTotal = Array.from(modelTotals.values()).reduce((s, v) => s + v.total_tokens, 0)

    const breakdown: ModelBreakdownItem[] = Array.from(modelTotals.entries()).map(([model_tag, stats]) => ({
      model_tag,
      total_tokens: stats.total_tokens,
      total_requests: stats.total_requests,
      percentage: grandTotal > 0 ? parseFloat(((stats.total_tokens / grandTotal) * 100).toFixed(2)) : 0,
    }))

    breakdown.sort((a, b) => b.total_tokens - a.total_tokens)

    return { period, breakdown }
  }

  // -------------------------------------------------------------------------
  // Task #5: getLatencyTimeseries
  // -------------------------------------------------------------------------

  /**
   * Get latency percentiles (p50/p95/p99) timeseries grouped by model_tag.
   * Only includes status='success' records.
   * Supports per-user, per-key, and platform-wide modes.
   */
  async getLatencyTimeseries(params: AggregationParams): Promise<LatencyResult> {
    const { period, userId, keyId } = params
    const granularity = getGranularity(period)
    const periodStart = getPeriodStart(period)

    const keyIds = await resolveKeyIds(userId, keyId)
    if (keyIds === null) {
      return { period, granularity, series: [] }
    }

    let query = supabaseAdmin
      .from('usage_logs')
      .select('model_tag, latency_ms, created_at')
      .eq('status', 'success')
      .gte('created_at', periodStart)
      .order('created_at', { ascending: true })

    if (keyIds !== undefined) {
      query = query.in('api_key_id', keyIds)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`getLatencyTimeseries failed: ${error.message}`)
    }

    const rows = data ?? []

    // Group by (bucket, model_tag) -> collect latency_ms values
    const buckets = new Map<string, Map<string, number[]>>()

    for (const row of rows) {
      if (row.latency_ms == null) continue
      const date = new Date(row.created_at)
      let bucketKey: string
      if (granularity === 'hour') {
        date.setMinutes(0, 0, 0)
        bucketKey = date.toISOString()
      } else {
        date.setHours(0, 0, 0, 0)
        bucketKey = date.toISOString()
      }

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, new Map())
      }
      const bucket = buckets.get(bucketKey)!
      if (!bucket.has(row.model_tag)) {
        bucket.set(row.model_tag, [])
      }
      bucket.get(row.model_tag)!.push(row.latency_ms)
    }

    const series: LatencyPoint[] = []
    for (const [timestamp, modelMap] of Array.from(buckets.entries()).sort()) {
      const point: LatencyPoint = { timestamp }
      for (const [modelTag, values] of modelMap.entries()) {
        point[modelTag] = computePercentiles(values)
      }
      series.push(point)
    }

    return { period, granularity, series }
  }

  // -------------------------------------------------------------------------
  // Task #6: getBillingSummary + getOverview + getTopUsers
  // -------------------------------------------------------------------------

  /**
   * Get billing summary for a user: cost breakdown, quota, recent topups.
   */
  async getBillingSummary(params: { userId: string; period: Period }): Promise<BillingResult> {
    const { userId, period } = params
    const periodStart = getPeriodStart(period)

    // Get user's active key IDs
    const { data: userKeys } = await supabaseAdmin
      .from('api_keys')
      .select('id, quota_tokens')
      .eq('user_id', userId)
      .eq('status', 'active')

    const activeKeys = userKeys ?? []
    const keyIds = activeKeys.map((k: { id: string }) => k.id)

    // Fetch usage logs for this user in the period
    let usageRows: Array<{ model_tag: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; created_at: string }> = []

    if (keyIds.length > 0) {
      const { data: usageData } = await supabaseAdmin
        .from('usage_logs')
        .select('model_tag, prompt_tokens, completion_tokens, total_tokens, created_at')
        .in('api_key_id', keyIds)
        .gte('created_at', periodStart)

      usageRows = usageData ?? []
    }

    // Group usage by model_tag
    const modelUsage = new Map<string, { prompt_tokens: number; completion_tokens: number; timestamps: string[] }>()
    for (const row of usageRows) {
      if (!modelUsage.has(row.model_tag)) {
        modelUsage.set(row.model_tag, { prompt_tokens: 0, completion_tokens: 0, timestamps: [] })
      }
      const entry = modelUsage.get(row.model_tag)!
      entry.prompt_tokens += row.prompt_tokens ?? 0
      entry.completion_tokens += row.completion_tokens ?? 0
      entry.timestamps.push(row.created_at)
    }

    // Calculate cost per model using historical rates
    let hasMissingRate = false
    const breakdownItems: BillingBreakdownItem[] = []

    for (const [model_tag, usage] of modelUsage.entries()) {
      // Use the latest timestamp of usage for this model (or period end)
      const latestTimestamp = usage.timestamps.sort().pop() ?? new Date().toISOString()
      const rate = await this.ratesService.getEffectiveRate(model_tag, latestTimestamp)

      if (!rate) {
        hasMissingRate = true
        continue
      }

      const input_cost_usd = (usage.prompt_tokens / 1000) * rate.input_rate_per_1k
      const output_cost_usd = (usage.completion_tokens / 1000) * rate.output_rate_per_1k

      breakdownItems.push({
        model_tag,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        input_cost_usd,
        output_cost_usd,
        total_cost_usd: input_cost_usd + output_cost_usd,
        rate: {
          input_rate_per_1k: rate.input_rate_per_1k,
          output_rate_per_1k: rate.output_rate_per_1k,
        },
      })
    }

    const cost =
      modelUsage.size === 0 || hasMissingRate
        ? null
        : {
            total_usd: breakdownItems.reduce((s, b) => s + b.total_cost_usd, 0),
            breakdown: breakdownItems,
          }

    // Quota calculation
    const quotaValues = activeKeys.map((k: { quota_tokens: number }) => k.quota_tokens)
    const is_unlimited = quotaValues.some((q: number) => q === -1)
    const total_quota_tokens = is_unlimited
      ? -1
      : quotaValues.reduce((s: number, q: number) => s + q, 0)

    // Daily avg consumption (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    let daily_avg_consumption = 0
    if (keyIds.length > 0) {
      const { data: recentUsage } = await supabaseAdmin
        .from('usage_logs')
        .select('total_tokens')
        .in('api_key_id', keyIds)
        .gte('created_at', sevenDaysAgo)

      const recentTotal = (recentUsage ?? []).reduce((s: number, r: { total_tokens: number }) => s + (r.total_tokens ?? 0), 0)
      daily_avg_consumption = Math.round(recentTotal / 7)
    }

    const estimated_days_remaining =
      is_unlimited || total_quota_tokens < 0
        ? null
        : daily_avg_consumption > 0
          ? parseFloat((total_quota_tokens / daily_avg_consumption).toFixed(1))
          : null

    // Recent topups (last 5)
    const { data: topupsData } = await supabaseAdmin
      .from('topup_logs')
      .select('id, amount_usd, tokens_granted, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    const recent_topups = (topupsData ?? []).map((t: { id: string; amount_usd: number; tokens_granted: number; created_at: string }) => ({
      id: t.id,
      amount_usd: t.amount_usd,
      tokens_granted: t.tokens_granted,
      created_at: t.created_at,
    }))

    return {
      period,
      cost,
      quota: {
        total_quota_tokens: is_unlimited ? -1 : total_quota_tokens,
        is_unlimited,
        estimated_days_remaining,
        daily_avg_consumption,
      },
      recent_topups,
    }
  }

  /**
   * Get platform-wide overview statistics.
   */
  async getOverview(period: Period): Promise<OverviewResult> {
    const periodStart = getPeriodStart(period)
    const granularity = getGranularity(period)

    const { data, error } = await supabaseAdmin
      .from('usage_logs')
      .select('model_tag, prompt_tokens, completion_tokens, total_tokens, latency_ms, api_key_id, created_at')
      .gte('created_at', periodStart)
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`getOverview failed: ${error.message}`)
    }

    const rows = data ?? []

    // Total stats
    let total_tokens = 0
    let total_requests = 0
    let latency_sum = 0
    let latency_count = 0
    const activeKeyIds = new Set<string>()

    for (const row of rows) {
      total_tokens += row.total_tokens ?? 0
      total_requests += 1
      if (row.latency_ms != null) {
        latency_sum += row.latency_ms
        latency_count += 1
      }
      activeKeyIds.add(row.api_key_id)
    }

    // Count distinct users from key IDs
    let active_users = 0
    if (activeKeyIds.size > 0) {
      const { data: keysData } = await supabaseAdmin
        .from('api_keys')
        .select('user_id')
        .in('id', Array.from(activeKeyIds))

      const userIdSet = new Set((keysData ?? []).map((k: { user_id: string }) => k.user_id))
      active_users = userIdSet.size
    }

    const avg_latency_ms = latency_count > 0 ? Math.round(latency_sum / latency_count) : 0

    // Build timeseries
    const buckets = new Map<string, Map<string, { total_tokens: number; requests: number }>>()
    for (const row of rows) {
      const date = new Date(row.created_at)
      let bucketKey: string
      if (granularity === 'hour') {
        date.setMinutes(0, 0, 0)
        bucketKey = date.toISOString()
      } else {
        date.setHours(0, 0, 0, 0)
        bucketKey = date.toISOString()
      }

      if (!buckets.has(bucketKey)) buckets.set(bucketKey, new Map())
      const bucket = buckets.get(bucketKey)!
      if (!bucket.has(row.model_tag)) bucket.set(row.model_tag, { total_tokens: 0, requests: 0 })
      const entry = bucket.get(row.model_tag)!
      entry.total_tokens += row.total_tokens ?? 0
      entry.requests += 1
    }

    const series: TimeseriesPoint[] = []
    for (const [timestamp, modelMap] of Array.from(buckets.entries()).sort()) {
      const point: TimeseriesPoint = { timestamp }
      for (const [modelTag, stats] of modelMap.entries()) {
        point[modelTag] = stats
      }
      series.push(point)
    }

    return { period, total_tokens, total_requests, active_users, avg_latency_ms, series }
  }

  /**
   * Get top users by token consumption for a given period.
   * Includes email (fetched from auth.users via admin API).
   */
  async getTopUsers(period: Period, limit = 10): Promise<TopUsersResult> {
    const periodStart = getPeriodStart(period)

    // Get all usage in the period
    const { data: usageData, error: usageError } = await supabaseAdmin
      .from('usage_logs')
      .select('api_key_id, total_tokens, prompt_tokens, completion_tokens, model_tag, created_at')
      .gte('created_at', periodStart)

    if (usageError) {
      throw new Error(`getTopUsers failed: ${usageError.message}`)
    }

    const rows = usageData ?? []
    if (rows.length === 0) return { period, rankings: [] }

    // Get unique key IDs
    const keyIds = [...new Set(rows.map((r: { api_key_id: string }) => r.api_key_id))]

    // Fetch user_id from api_keys
    const { data: keysData } = await supabaseAdmin
      .from('api_keys')
      .select('id, user_id')
      .in('id', keyIds)

    const keyToUser = new Map<string, string>()
    for (const k of (keysData ?? [])) {
      keyToUser.set(k.id, k.user_id)
    }

    // Aggregate by user
    const userStats = new Map<string, { total_tokens: number; total_requests: number; model_usage: Map<string, { prompt: number; completion: number; timestamps: string[] }> }>()

    for (const row of rows) {
      const userId = keyToUser.get(row.api_key_id)
      if (!userId) continue

      if (!userStats.has(userId)) {
        userStats.set(userId, { total_tokens: 0, total_requests: 0, model_usage: new Map() })
      }
      const stats = userStats.get(userId)!
      stats.total_tokens += row.total_tokens ?? 0
      stats.total_requests += 1

      if (!stats.model_usage.has(row.model_tag)) {
        stats.model_usage.set(row.model_tag, { prompt: 0, completion: 0, timestamps: [] })
      }
      const mu = stats.model_usage.get(row.model_tag)!
      mu.prompt += row.prompt_tokens ?? 0
      mu.completion += row.completion_tokens ?? 0
      mu.timestamps.push(row.created_at)
    }

    // Sort by total_tokens, take top N
    const sorted = Array.from(userStats.entries())
      .sort((a, b) => b[1].total_tokens - a[1].total_tokens)
      .slice(0, Math.min(limit, 50))

    // Fetch user emails via admin API
    const userIds = sorted.map(([uid]) => uid)
    const emailMap = new Map<string, string>()

    for (const uid of userIds) {
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid)
        if (userData?.user?.email) {
          emailMap.set(uid, userData.user.email)
        }
      } catch {
        // ignore individual failures
      }
    }

    // Calculate cost per user
    const rankings: TopUserItem[] = []
    for (const [userId, stats] of sorted) {
      let total_cost_usd: number | null = 0
      let hasMissingRate = false

      for (const [model_tag, mu] of stats.model_usage.entries()) {
        const latestTs = mu.timestamps.sort().pop() ?? new Date().toISOString()
        const rate = await this.ratesService.getEffectiveRate(model_tag, latestTs)
        if (!rate) {
          hasMissingRate = true
          break
        }
        const cost = (mu.prompt / 1000) * rate.input_rate_per_1k + (mu.completion / 1000) * rate.output_rate_per_1k
        total_cost_usd! += cost
      }

      if (hasMissingRate) total_cost_usd = null

      rankings.push({
        user_id: userId,
        email: emailMap.get(userId) ?? '',
        total_tokens: stats.total_tokens,
        total_requests: stats.total_requests,
        total_cost_usd,
      })
    }

    return { period, rankings }
  }
}

// ---------------------------------------------------------------------------
// Percentile calculation utility
// ---------------------------------------------------------------------------

function computePercentiles(values: number[]): { p50: number; p95: number; p99: number } {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = p * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sorted[lower]
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower))
}
