/**
 * AggregationService unit tests
 * All methods now delegate to supabase.rpc(), so we mock supabaseAdmin.rpc().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
  },
}))

const { supabaseAdmin } = await import('../../lib/supabase.js')
const { AggregationService } = await import('../AggregationService.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRpc(data: unknown[], error: unknown = null) {
  ;(supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data, error })
}

function mockRpcError(message: string) {
  ;(supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: { message } })
}

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

const NOW = new Date('2026-03-15T12:00:00Z')
const DAY_BUCKET = '2026-03-14T00:00:00Z'
const HOUR_BUCKET = '2026-03-15T10:00:00Z'

function makeTimeseriesRow(overrides: Partial<{ bucket: string; model_tag: string; total_tokens: number }> = {}) {
  return {
    bucket: DAY_BUCKET,
    model_tag: 'apex-smart',
    total_tokens: 150,
    ...overrides,
  }
}

function makeLatencyRow(overrides: Partial<{ bucket: string; model_tag: string; p50: number; p95: number; p99: number }> = {}) {
  return {
    bucket: DAY_BUCKET,
    model_tag: 'apex-smart',
    p50: 300,
    p95: 800,
    p99: 950,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AggregationService', () => {
  let svc: InstanceType<typeof AggregationService>
  const rpcMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    svc = new AggregationService()
    ;(supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockImplementation(rpcMock)
  })

  // -------------------------------------------------------------------------
  // getTimeseries
  // -------------------------------------------------------------------------

  describe('getTimeseries', () => {
    it('should return daily timeseries for 7d period', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [
          makeTimeseriesRow({ model_tag: 'apex-smart', total_tokens: 100 }),
          makeTimeseriesRow({ model_tag: 'apex-cheap', total_tokens: 50 }),
        ],
        error: null,
      })

      const result = await svc.getTimeseries({ period: '7d' })

      expect(result.period).toBe('7d')
      expect(result.granularity).toBe('day')
      expect(result.series.length).toBeGreaterThan(0)
      expect(result.totals.total_tokens).toBe(150)
      expect(result.totals.total_requests).toBe(2)
    })

    it('should return hourly granularity for 24h period', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [makeTimeseriesRow({ bucket: HOUR_BUCKET })],
        error: null,
      })

      const result = await svc.getTimeseries({ period: '24h' })

      expect(result.granularity).toBe('hour')
    })

    it('should return empty result when RPC returns no rows', async () => {
      rpcMock.mockResolvedValueOnce({ data: [], error: null })

      const result = await svc.getTimeseries({ period: '7d', userId: 'user-with-no-keys' })

      expect(result.series).toEqual([])
      expect(result.totals.total_tokens).toBe(0)
    })

    it('should call analytics_timeseries with correct params including key_id', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [makeTimeseriesRow({ total_tokens: 200 })],
        error: null,
      })

      const result = await svc.getTimeseries({ period: '7d', keyId: 'specific-key' })

      expect(rpcMock).toHaveBeenCalledWith('analytics_timeseries', {
        p_user_id: null,
        p_key_id: 'specific-key',
        p_period: '7d',
      })
      expect(result.totals.total_tokens).toBe(200)
    })

    it('should aggregate multiple models into separate series entries per bucket', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [
          makeTimeseriesRow({ bucket: DAY_BUCKET, model_tag: 'apex-smart', total_tokens: 160 }),
          makeTimeseriesRow({ bucket: DAY_BUCKET, model_tag: 'apex-cheap', total_tokens: 80 }),
        ],
        error: null,
      })

      const result = await svc.getTimeseries({ period: '7d' })

      expect(result.series.length).toBe(1)
      const bucket = result.series[0]
      const smartData = bucket['apex-smart'] as { total_tokens: number }
      expect(smartData.total_tokens).toBe(160)
    })

    it('should throw when RPC returns error', async () => {
      rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'db error' } })

      await expect(svc.getTimeseries({ period: '7d' })).rejects.toThrow('getTimeseries failed: db error')
    })
  })

  // -------------------------------------------------------------------------
  // getModelBreakdown
  // -------------------------------------------------------------------------

  describe('getModelBreakdown', () => {
    it('should return model breakdown with correct percentages', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [
          { model_tag: 'apex-smart', total_tokens: 1000, request_count: 5 },
          { model_tag: 'apex-cheap', total_tokens: 1000, request_count: 3 },
        ],
        error: null,
      })

      const result = await svc.getModelBreakdown({ period: '7d' })

      expect(result.period).toBe('7d')
      const smart = result.breakdown.find(b => b.model_tag === 'apex-smart')
      const cheap = result.breakdown.find(b => b.model_tag === 'apex-cheap')

      expect(smart).toBeDefined()
      expect(cheap).toBeDefined()
      expect(smart!.total_tokens).toBe(1000)
      expect(cheap!.total_tokens).toBe(1000)
      expect(smart!.percentage).toBe(50)
      expect(cheap!.percentage).toBe(50)
    })

    it('should return empty breakdown when no usage', async () => {
      rpcMock.mockResolvedValueOnce({ data: [], error: null })

      const result = await svc.getModelBreakdown({ period: '7d' })

      expect(result.breakdown).toEqual([])
    })

    it('should preserve RPC ordering (total_tokens DESC)', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [
          { model_tag: 'apex-smart', total_tokens: 900, request_count: 9 },
          { model_tag: 'apex-cheap', total_tokens: 100, request_count: 1 },
        ],
        error: null,
      })

      const result = await svc.getModelBreakdown({ period: '7d' })

      expect(result.breakdown[0].model_tag).toBe('apex-smart')
      expect(result.breakdown[1].model_tag).toBe('apex-cheap')
    })

    it('should call analytics_model_breakdown with correct params', async () => {
      rpcMock.mockResolvedValueOnce({ data: [], error: null })

      await svc.getModelBreakdown({ period: '30d', userId: 'user-abc' })

      expect(rpcMock).toHaveBeenCalledWith('analytics_model_breakdown', {
        p_user_id: 'user-abc',
        p_key_id: null,
        p_period: '30d',
      })
    })
  })

  // -------------------------------------------------------------------------
  // getLatencyTimeseries
  // -------------------------------------------------------------------------

  describe('getLatencyTimeseries', () => {
    it('should return p50/p95/p99 series for per-user mode', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [
          makeLatencyRow({ p50: 300, p95: 800, p99: 950 }),
        ],
        error: null,
      })

      const result = await svc.getLatencyTimeseries({ period: '7d', userId: 'user-1' })

      expect(result.series.length).toBe(1)
      const smartData = result.series[0]['apex-smart'] as { p50: number; p95: number; p99: number }
      expect(smartData.p50).toBe(300)
      expect(smartData.p95).toBe(800)
      expect(smartData.p99).toBe(950)
    })

    it('should use analytics_latency_percentile RPC when userId provided', async () => {
      rpcMock.mockResolvedValueOnce({ data: [], error: null })

      await svc.getLatencyTimeseries({ period: '7d', userId: 'user-1' })

      expect(rpcMock).toHaveBeenCalledWith('analytics_latency_percentile', expect.objectContaining({
        p_user_id: 'user-1',
        p_period: '7d',
      }))
    })

    it('should use analytics_platform_latency RPC for platform-wide mode', async () => {
      rpcMock.mockResolvedValueOnce({ data: [], error: null })

      await svc.getLatencyTimeseries({ period: '7d' })

      expect(rpcMock).toHaveBeenCalledWith('analytics_platform_latency', {
        p_period: '7d',
        p_model_tag: null,
      })
    })

    it('should return empty series when no data', async () => {
      rpcMock.mockResolvedValueOnce({ data: [], error: null })

      const result = await svc.getLatencyTimeseries({ period: '7d' })

      expect(result.series).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // getOverview
  // -------------------------------------------------------------------------

  describe('getOverview', () => {
    it('should aggregate platform-wide stats via two RPC calls', async () => {
      // First call: analytics_platform_overview
      rpcMock.mockResolvedValueOnce({
        data: [{ total_tokens: 3000, total_requests: 2, active_users: 2, total_revenue_usd: 5.0 }],
        error: null,
      })
      // Second call: analytics_platform_timeseries
      rpcMock.mockResolvedValueOnce({
        data: [
          { bucket: DAY_BUCKET, model_tag: 'apex-smart', total_tokens: 1000 },
          { bucket: DAY_BUCKET, model_tag: 'apex-cheap', total_tokens: 2000 },
        ],
        error: null,
      })

      const result = await svc.getOverview('7d')

      expect(result.period).toBe('7d')
      expect(result.total_tokens).toBe(3000)
      expect(result.total_requests).toBe(2)
      expect(result.active_users).toBe(2)
      expect(result.series.length).toBe(1)
    })

    it('should throw if overview RPC fails', async () => {
      rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
      rpcMock.mockResolvedValueOnce({ data: [], error: null })

      await expect(svc.getOverview('7d')).rejects.toThrow('getOverview failed: timeout')
    })
  })
})
