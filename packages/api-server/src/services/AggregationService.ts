import { supabaseAdmin } from '../lib/supabase.js'

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

// ---------------------------------------------------------------------------
// AggregationService
// ---------------------------------------------------------------------------

export class AggregationService {
  // -------------------------------------------------------------------------
  // getTimeseries
  // -------------------------------------------------------------------------

  /**
   * Get token usage timeseries, grouped by bucket + model_tag.
   * Uses analytics_timeseries RPC (handles JOIN api_keys inside SQL).
   */
  async getTimeseries(params: AggregationParams): Promise<TimeseriesResult> {
    const { period, userId, keyId } = params
    const granularity = getGranularity(period)

    const { data, error } = await supabaseAdmin.rpc('analytics_timeseries', {
      p_user_id: userId ?? null,
      p_key_id: keyId ?? null,
      p_period: period,
    })

    if (error) {
      throw new Error(`getTimeseries failed: ${error.message}`)
    }

    const rows: Array<{ bucket: string; model_tag: string; total_tokens: number }> = data ?? []

    // Group rows into TimeseriesPoint[] keyed by bucket timestamp
    const bucketMap = new Map<string, TimeseriesPoint>()
    let grand_total_tokens = 0

    for (const row of rows) {
      const timestamp = row.bucket
      if (!bucketMap.has(timestamp)) {
        bucketMap.set(timestamp, { timestamp })
      }
      const point = bucketMap.get(timestamp)!
      const tokens = Number(row.total_tokens)
      // RPC groups by (bucket, model_tag); accumulate if same model appears multiple times
      const existing = point[row.model_tag] as { total_tokens: number; total_requests: number } | undefined
      if (existing) {
        existing.total_tokens += tokens
        existing.total_requests += 1
      } else {
        point[row.model_tag] = { total_tokens: tokens, total_requests: 1 }
      }
      grand_total_tokens += tokens
    }

    const series: TimeseriesPoint[] = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, point]) => point)

    // totals: RPC does not return prompt/completion breakdown, compute from rows
    // analytics_timeseries only gives total_tokens; set prompt/completion to 0 as unavailable
    return {
      period,
      granularity,
      series,
      totals: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: grand_total_tokens,
        total_requests: rows.length,
      },
    }
  }

  /**
   * Get model breakdown (distribution by model_tag) for a given period.
   * Uses analytics_model_breakdown RPC.
   */
  async getModelBreakdown(params: AggregationParams): Promise<ModelBreakdownResult> {
    const { period, userId, keyId } = params

    const { data, error } = await supabaseAdmin.rpc('analytics_model_breakdown', {
      p_user_id: userId ?? null,
      p_key_id: keyId ?? null,
      p_period: period,
    })

    if (error) {
      throw new Error(`getModelBreakdown failed: ${error.message}`)
    }

    const rows: Array<{ model_tag: string; total_tokens: number; request_count: number }> = data ?? []

    const grandTotal = rows.reduce((s, r) => s + Number(r.total_tokens), 0)

    const breakdown: ModelBreakdownItem[] = rows.map((r) => ({
      model_tag: r.model_tag,
      total_tokens: Number(r.total_tokens),
      total_requests: Number(r.request_count),
      percentage: grandTotal > 0 ? parseFloat(((Number(r.total_tokens) / grandTotal) * 100).toFixed(2)) : 0,
    }))

    // RPC already returns ORDER BY total_tokens DESC
    return { period, breakdown }
  }

  // -------------------------------------------------------------------------
  // getLatencyTimeseries
  // -------------------------------------------------------------------------

  /**
   * Get latency percentiles (p50/p95/p99) timeseries grouped by model_tag.
   * Per-user / per-key mode → analytics_latency_percentile RPC
   * Platform-wide mode (no userId/keyId) → analytics_platform_latency RPC
   */
  async getLatencyTimeseries(params: AggregationParams): Promise<LatencyResult> {
    const { period, userId, keyId } = params
    const granularity = getGranularity(period)

    let rows: Array<{ bucket: string; model_tag: string; p50: number; p95: number; p99: number }>

    if (userId != null || keyId != null) {
      // Per-user or per-key mode
      const { data, error } = await supabaseAdmin.rpc('analytics_latency_percentile', {
        p_user_id: userId ?? null,
        p_key_id: keyId ?? null,
        p_period: period,
        p_model_tag: null,
      })
      if (error) {
        throw new Error(`getLatencyTimeseries failed: ${error.message}`)
      }
      rows = data ?? []
    } else {
      // Platform-wide mode (admin)
      const { data, error } = await supabaseAdmin.rpc('analytics_platform_latency', {
        p_period: period,
        p_model_tag: null,
      })
      if (error) {
        throw new Error(`getLatencyTimeseries failed: ${error.message}`)
      }
      rows = data ?? []
    }

    // Group into LatencyPoint[] by bucket timestamp
    const bucketMap = new Map<string, LatencyPoint>()

    for (const row of rows) {
      const timestamp = row.bucket
      if (!bucketMap.has(timestamp)) {
        bucketMap.set(timestamp, { timestamp })
      }
      const point = bucketMap.get(timestamp)!
      point[row.model_tag] = {
        p50: Number(row.p50),
        p95: Number(row.p95),
        p99: Number(row.p99),
      }
    }

    const series: LatencyPoint[] = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, point]) => point)

    return { period, granularity, series }
  }

  // -------------------------------------------------------------------------
  // getBillingSummary
  // -------------------------------------------------------------------------

  /**
   * Get billing summary for a user: cost breakdown, quota, recent topups.
   * Uses analytics_billing_summary RPC.
   * Quota info is fetched separately from api_keys (RPC only returns total_quota_tokens / has_unlimited).
   */
  async getBillingSummary(params: { userId: string; period: Period }): Promise<BillingResult> {
    const { userId, period } = params

    const { data, error } = await supabaseAdmin.rpc('analytics_billing_summary', {
      p_user_id: userId,
    })

    if (error) {
      throw new Error(`getBillingSummary failed: ${error.message}`)
    }

    const rows: Array<{
      model_tag: string
      prompt_tokens: number
      completion_tokens: number
      input_cost_usd: number | null
      output_cost_usd: number | null
      total_cost_usd: number
      rate_input: number | null
      rate_output: number | null
      total_quota_tokens: number
      has_unlimited: boolean
      daily_avg_7d: number
      recent_topups: Array<{ id: string; amount_usd: number; tokens_granted: number; created_at: string }>
    }> = data ?? []

    // Build cost breakdown from rows (one row per model_tag)
    const hasMissingRate = rows.some((r) => r.rate_input == null || r.rate_output == null)
    const breakdownItems: BillingBreakdownItem[] = rows
      .filter((r) => r.rate_input != null && r.rate_output != null)
      .map((r) => ({
        model_tag: r.model_tag,
        prompt_tokens: Number(r.prompt_tokens),
        completion_tokens: Number(r.completion_tokens),
        input_cost_usd: Number(r.input_cost_usd ?? 0),
        output_cost_usd: Number(r.output_cost_usd ?? 0),
        total_cost_usd: Number(r.total_cost_usd),
        rate: {
          input_rate_per_1k: Number(r.rate_input),
          output_rate_per_1k: Number(r.rate_output),
        },
      }))

    const cost =
      rows.length === 0 || hasMissingRate
        ? null
        : {
            total_usd: breakdownItems.reduce((s, b) => s + b.total_cost_usd, 0),
            breakdown: breakdownItems,
          }

    // Extract quota and daily_avg from first row (cross-joined, same value on all rows)
    const firstRow = rows[0]
    const total_quota_tokens = firstRow ? Number(firstRow.total_quota_tokens) : 0
    const is_unlimited = firstRow ? Boolean(firstRow.has_unlimited) : false
    const daily_avg_consumption = firstRow ? Math.round(Number(firstRow.daily_avg_7d)) : 0

    const estimated_days_remaining =
      is_unlimited || total_quota_tokens < 0
        ? null
        : daily_avg_consumption > 0
          ? parseFloat((total_quota_tokens / daily_avg_consumption).toFixed(1))
          : null

    // Extract recent_topups from first row (same JSONB on all rows)
    const recent_topups: BillingResult['recent_topups'] = firstRow
      ? ((firstRow.recent_topups as unknown as Array<{
          id: string
          amount_usd: number
          tokens_granted: number
          created_at: string
        }>) ?? []).map((t) => ({
          id: t.id,
          amount_usd: Number(t.amount_usd),
          tokens_granted: Number(t.tokens_granted),
          created_at: t.created_at,
        }))
      : []

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

  // -------------------------------------------------------------------------
  // getOverview
  // -------------------------------------------------------------------------

  /**
   * Get platform-wide overview statistics.
   * Uses analytics_platform_overview RPC for aggregate stats
   * and analytics_platform_timeseries RPC for the series.
   */
  async getOverview(period: Period): Promise<OverviewResult> {
    const granularity = getGranularity(period)

    // Fetch overview stats and timeseries in parallel
    const [overviewResult, timeseriesResult] = await Promise.all([
      supabaseAdmin.rpc('analytics_platform_overview', { p_period: period }),
      supabaseAdmin.rpc('analytics_platform_timeseries', { p_period: period }),
    ])

    if (overviewResult.error) {
      throw new Error(`getOverview failed: ${overviewResult.error.message}`)
    }
    if (timeseriesResult.error) {
      throw new Error(`getOverview timeseries failed: ${timeseriesResult.error.message}`)
    }

    // analytics_platform_overview returns a single row
    const overviewRows: Array<{
      total_tokens: number
      total_requests: number
      active_users: number
      total_revenue_usd: number
    }> = overviewResult.data ?? []
    const ov = overviewRows[0] ?? { total_tokens: 0, total_requests: 0, active_users: 0, total_revenue_usd: 0 }

    // analytics_platform_timeseries returns (bucket, model_tag, total_tokens)
    const tsRows: Array<{ bucket: string; model_tag: string; total_tokens: number }> = timeseriesResult.data ?? []

    const bucketMap = new Map<string, TimeseriesPoint>()
    for (const row of tsRows) {
      const timestamp = row.bucket
      if (!bucketMap.has(timestamp)) {
        bucketMap.set(timestamp, { timestamp })
      }
      const point = bucketMap.get(timestamp)!
      const tokens = Number(row.total_tokens)
      const existing = point[row.model_tag] as { total_tokens: number; requests: number } | undefined
      if (existing) {
        existing.total_tokens += tokens
        existing.requests += 1
      } else {
        point[row.model_tag] = { total_tokens: tokens, requests: 1 }
      }
    }

    const series: TimeseriesPoint[] = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, point]) => point)

    return {
      period,
      total_tokens: Number(ov.total_tokens),
      total_requests: Number(ov.total_requests),
      active_users: Number(ov.active_users),
      avg_latency_ms: 0, // not provided by analytics_platform_overview RPC
      series,
    }
  }

  // -------------------------------------------------------------------------
  // getTopUsers
  // -------------------------------------------------------------------------

  /**
   * Get top users by token consumption for a given period.
   * Uses analytics_top_users RPC (handles email JOIN inside SQL).
   */
  async getTopUsers(period: Period, limit = 10): Promise<TopUsersResult> {
    const { data, error } = await supabaseAdmin.rpc('analytics_top_users', {
      p_period: period,
      p_limit: Math.min(limit, 50),
    })

    if (error) {
      throw new Error(`getTopUsers failed: ${error.message}`)
    }

    const rows: Array<{
      user_id: string
      email: string
      total_tokens: number
      total_cost_usd: number | null
    }> = data ?? []

    const rankings: TopUserItem[] = rows.map((r) => ({
      user_id: r.user_id,
      email: r.email ?? '',
      total_tokens: Number(r.total_tokens),
      total_requests: 0, // not provided by analytics_top_users RPC
      total_cost_usd: r.total_cost_usd != null ? Number(r.total_cost_usd) : null,
    }))

    return { period, rankings }
  }
}
