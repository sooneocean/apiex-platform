/**
 * AggregationService unit tests
 * Uses JS-level aggregation (no real DB), so we mock supabaseAdmin.from() return values.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: {
      admin: {
        getUserById: vi.fn(),
      },
    },
  },
}))

const { supabaseAdmin } = await import('../../lib/supabase.js')
const { AggregationService } = await import('../AggregationService.js')

// ---------------------------------------------------------------------------
// Helpers to build mock chain for supabase queries
// ---------------------------------------------------------------------------

/**
 * Build a query chain where all methods return the chain itself (chainable),
 * but the chain is also a thenable that resolves to { data, error }.
 * This supports both .in().then() and .gte().then() patterns.
 */
function makeQueryChain(data: unknown[], error: unknown = null) {
  const terminal = { data, error }
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  // Make the chain itself thenable (Promise-like)
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(terminal).then(resolve)
  chain.catch = (reject: (e: unknown) => unknown) => Promise.resolve(terminal).catch(reject)
  return chain
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const NOW = new Date('2026-03-15T12:00:00Z')

function makeUsageRow(overrides: Partial<{
  api_key_id: string
  model_tag: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number
  status: string
  created_at: string
}> = {}) {
  return {
    api_key_id: 'key-1',
    model_tag: 'apex-smart',
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    latency_ms: 300,
    status: 'success',
    created_at: new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString(), // yesterday
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AggregationService', () => {
  let svc: InstanceType<typeof AggregationService>
  const fromMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    svc = new AggregationService()
    ;(supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(fromMock)
  })

  // -------------------------------------------------------------------------
  // getTimeseries
  // -------------------------------------------------------------------------

  describe('getTimeseries', () => {
    function setupUsageMock(rows: unknown[]) {
      const chain = makeQueryChain(rows)
      fromMock.mockReturnValue(chain)
      return chain
    }

    it('should return daily timeseries for 7d period', async () => {
      setupUsageMock([
        makeUsageRow({ model_tag: 'apex-smart', total_tokens: 100 }),
        makeUsageRow({ model_tag: 'apex-cheap', total_tokens: 50 }),
      ])

      const result = await svc.getTimeseries({ period: '7d' })

      expect(result.period).toBe('7d')
      expect(result.granularity).toBe('day')
      expect(result.series.length).toBeGreaterThan(0)
      expect(result.totals.total_tokens).toBe(150)
      expect(result.totals.total_requests).toBe(2)
    })

    it('should return hourly timeseries for 24h period', async () => {
      setupUsageMock([
        makeUsageRow({ created_at: new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString() }),
      ])

      const result = await svc.getTimeseries({ period: '24h' })

      expect(result.granularity).toBe('hour')
    })

    it('should return empty result when user has no keys', async () => {
      // First call: api_keys query returns empty
      fromMock.mockReturnValueOnce(makeQueryChain([]))

      const result = await svc.getTimeseries({ period: '7d', userId: 'user-with-no-keys' })

      expect(result.series).toEqual([])
      expect(result.totals.total_tokens).toBe(0)
    })

    it('should filter by key_id when provided', async () => {
      const chain = makeQueryChain([makeUsageRow({ api_key_id: 'specific-key', total_tokens: 200 })])
      fromMock.mockReturnValue(chain)

      const result = await svc.getTimeseries({ period: '7d', keyId: 'specific-key' })

      expect(result.totals.total_tokens).toBe(200)
      // Should use IN filter with the specific key
      expect(chain.in).toHaveBeenCalledWith('api_key_id', ['specific-key'])
    })

    it('should aggregate multiple models into separate series entries', async () => {
      const dayAgo = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
      dayAgo.setHours(0, 0, 0, 0)

      setupUsageMock([
        makeUsageRow({ model_tag: 'apex-smart', total_tokens: 100, created_at: dayAgo.toISOString() }),
        makeUsageRow({ model_tag: 'apex-cheap', total_tokens: 80, created_at: dayAgo.toISOString() }),
        makeUsageRow({ model_tag: 'apex-smart', total_tokens: 60, created_at: dayAgo.toISOString() }),
      ])

      const result = await svc.getTimeseries({ period: '7d' })

      expect(result.series.length).toBeGreaterThan(0)
      const bucket = result.series[0]
      // apex-smart should be aggregated: 100+60=160
      const smartData = bucket['apex-smart'] as { total_tokens: number }
      expect(smartData.total_tokens).toBe(160)
    })
  })

  // -------------------------------------------------------------------------
  // getModelBreakdown
  // -------------------------------------------------------------------------

  describe('getModelBreakdown', () => {
    function setupBreakdownMock(rows: unknown[]) {
      const chain = makeQueryChain(rows)
      fromMock.mockReturnValue(chain)
      return chain
    }

    it('should return model breakdown with correct percentages', async () => {
      setupBreakdownMock([
        { model_tag: 'apex-smart', total_tokens: 750 },
        { model_tag: 'apex-smart', total_tokens: 250 },
        { model_tag: 'apex-cheap', total_tokens: 500 },
        { model_tag: 'apex-cheap', total_tokens: 500 },
      ])

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
      setupBreakdownMock([])

      const result = await svc.getModelBreakdown({ period: '7d' })

      expect(result.breakdown).toEqual([])
    })

    it('should sort breakdown by total_tokens descending', async () => {
      setupBreakdownMock([
        { model_tag: 'apex-cheap', total_tokens: 100 },
        { model_tag: 'apex-smart', total_tokens: 900 },
      ])

      const result = await svc.getModelBreakdown({ period: '7d' })

      expect(result.breakdown[0].model_tag).toBe('apex-smart')
      expect(result.breakdown[1].model_tag).toBe('apex-cheap')
    })
  })

  // -------------------------------------------------------------------------
  // getLatencyTimeseries
  // -------------------------------------------------------------------------

  describe('getLatencyTimeseries', () => {
    function setupLatencyMock(rows: unknown[]) {
      const chain = makeQueryChain(rows)
      fromMock.mockReturnValue(chain)
      return chain
    }

    it('should compute p50/p95/p99 for each model', async () => {
      const dayAgo = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
      dayAgo.setHours(0, 0, 0, 0)

      const rows = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map(latency => ({
        model_tag: 'apex-smart',
        latency_ms: latency,
        status: 'success',
        created_at: dayAgo.toISOString(),
      }))
      setupLatencyMock(rows)

      const result = await svc.getLatencyTimeseries({ period: '7d' })

      expect(result.series.length).toBe(1)
      const smartData = result.series[0]['apex-smart'] as { p50: number; p95: number; p99: number }
      expect(smartData.p50).toBeGreaterThan(0)
      expect(smartData.p95).toBeGreaterThan(smartData.p50)
      expect(smartData.p99).toBeGreaterThan(smartData.p95)
    })

    it('should filter only success status rows', async () => {
      const chain = setupLatencyMock([
        { model_tag: 'apex-smart', latency_ms: 300, status: 'success', created_at: new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString() },
      ])

      await svc.getLatencyTimeseries({ period: '7d' })

      // Should have called .eq('status', 'success')
      expect(chain.eq).toHaveBeenCalledWith('status', 'success')
    })

    it('should return empty series when no data', async () => {
      setupLatencyMock([])

      const result = await svc.getLatencyTimeseries({ period: '7d' })

      expect(result.series).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // getOverview
  // -------------------------------------------------------------------------

  describe('getOverview', () => {
    it('should aggregate platform-wide stats', async () => {
      const usageRows = [
        makeUsageRow({ api_key_id: 'key-1', total_tokens: 1000, latency_ms: 200 }),
        makeUsageRow({ api_key_id: 'key-2', total_tokens: 2000, latency_ms: 400 }),
      ]

      let callCount = 0
      fromMock.mockImplementation((table: string) => {
        if (table === 'usage_logs') {
          return {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: usageRows, error: null }),
          }
        }
        if (table === 'api_keys') {
          callCount++
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [{ user_id: 'user-1' }, { user_id: 'user-2' }],
              error: null,
            }),
          }
        }
        return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }) }
      })

      const result = await svc.getOverview('7d')

      expect(result.period).toBe('7d')
      expect(result.total_tokens).toBe(3000)
      expect(result.total_requests).toBe(2)
      expect(result.avg_latency_ms).toBe(300) // (200+400)/2
      expect(result.active_users).toBe(2)
    })
  })
})
