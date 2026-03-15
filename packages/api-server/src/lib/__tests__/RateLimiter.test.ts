/**
 * T3 TDD — RateLimiter 測試（9 test cases）
 * T6 TDD — RateLimiter 擴展測試（Redis backend, fallback, model override）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
const mockSingle = vi.fn()
const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

vi.mock('../supabase.js', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

// Mock @upstash/redis
const mockPipelineExec = vi.fn()
const mockPipeline = {
  zadd: vi.fn().mockReturnThis(),
  zremrangebyscore: vi.fn().mockReturnThis(),
  zcard: vi.fn().mockReturnThis(),
  zrangebyscore: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: mockPipelineExec,
}
const mockRedisPipeline = vi.fn().mockReturnValue(mockPipeline)
const mockRedisInstance = { pipeline: mockRedisPipeline }
const MockRedis = vi.fn().mockReturnValue(mockRedisInstance)

vi.mock('@upstash/redis', () => ({
  Redis: MockRedis,
}))

const { RateLimiter, RedisCounterBackend, MemoryCounterBackend, createRateLimiter } = await import('../RateLimiter.js')

describe('RateLimiter — T3', () => {
  let rateLimiter: InstanceType<typeof RateLimiter>

  // Shared mock DB setup for pro tier
  const mockDbTier = (tier: string, rpm: number, tpm: number) => {
    mockSingle.mockResolvedValue({ data: { tier, rpm, tpm }, error: null })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: pro tier
    mockDbTier('pro', 60, 500000)
    // Rebuild mock chain
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    rateLimiter = new RateLimiter()
  })

  // Case 1: first request is always allowed
  it('should allow first request', async () => {
    const result = await rateLimiter.check('key-1', 'pro', 100)
    expect(result.allowed).toBe(true)
    expect(result.limits.rpm).toBe(60)
    expect(result.limits.tpm).toBe(500000)
  })

  // Case 2: RPM limit blocks when exceeded
  it('should block when RPM limit is reached', async () => {
    mockDbTier('free', 2, 100000)
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    rateLimiter = new RateLimiter()

    await rateLimiter.check('key-rpm', 'free', 100)
    await rateLimiter.check('key-rpm', 'free', 100)
    const result = await rateLimiter.check('key-rpm', 'free', 100)

    expect(result.allowed).toBe(false)
    expect(result.remaining.rpm).toBe(0)
    expect(result.retryAfter).toBeDefined()
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  // Case 3: TPM limit blocks when exceeded
  it('should block when TPM limit would be exceeded', async () => {
    mockDbTier('free', 20, 200)
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    rateLimiter = new RateLimiter()

    await rateLimiter.check('key-tpm', 'free', 150)
    const result = await rateLimiter.check('key-tpm', 'free', 150)

    expect(result.allowed).toBe(false)
    expect(result.remaining.tpm).toBe(0)
  })

  // Case 4: unlimited tier always allowed
  it('should always allow unlimited tier', async () => {
    mockDbTier('unlimited', -1, -1)
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    rateLimiter = new RateLimiter()

    for (let i = 0; i < 100; i++) {
      const result = await rateLimiter.check('key-unlimited', 'unlimited', 99999)
      expect(result.allowed).toBe(true)
    }
  })

  // Case 5: remaining counts are correct
  it('should track remaining correctly', async () => {
    mockDbTier('free', 5, 100000)
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    rateLimiter = new RateLimiter()

    const result1 = await rateLimiter.check('key-rem', 'free', 100)
    expect(result1.remaining.rpm).toBe(4)

    const result2 = await rateLimiter.check('key-rem', 'free', 100)
    expect(result2.remaining.rpm).toBe(3)
  })

  // Case 6: config is cached after first fetch
  it('should cache config and not re-query DB within TTL', async () => {
    await rateLimiter.check('key-cache', 'pro', 100)
    await rateLimiter.check('key-cache', 'pro', 100)
    await rateLimiter.check('key-cache', 'pro', 100)

    // mockFrom called once for config load, then cached
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  // Case 7: different keys have independent counters
  it('should track counters independently per key', async () => {
    mockDbTier('free', 2, 100000)
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    rateLimiter = new RateLimiter()

    await rateLimiter.check('key-A', 'free', 100)
    await rateLimiter.check('key-A', 'free', 100)
    const resultA = await rateLimiter.check('key-A', 'free', 100)
    const resultB = await rateLimiter.check('key-B', 'free', 100)

    expect(resultA.allowed).toBe(false)
    expect(resultB.allowed).toBe(true)
  })

  // Case 8: record() updates last token entry
  it('should update last token count on record()', async () => {
    mockDbTier('free', 20, 500)
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    rateLimiter = new RateLimiter()

    // Estimate 100, but actual is 50
    await rateLimiter.check('key-rec', 'free', 100)
    rateLimiter.record('key-rec', 50)

    // Next check should see 50 tokens used, not 100
    const result = await rateLimiter.check('key-rec', 'free', 400)
    // 50 used + 400 request = 450, within 500 limit
    expect(result.allowed).toBe(true)
  })

  // Case 9: DB error falls back to free tier defaults
  it('should fallback to free tier on DB error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    rateLimiter = new RateLimiter()

    const config = await rateLimiter.getConfig('unknown-tier')
    expect(config.tier).toBe('free')
    expect(config.rpm).toBe(20)
    expect(config.tpm).toBe(100000)
  })
})

// ---------------------------------------------------------------------------
// T6: RedisCounterBackend 測試
// ---------------------------------------------------------------------------

describe('RedisCounterBackend — T6', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedisPipeline.mockReturnValue(mockPipeline)
    mockPipeline.zadd.mockReturnThis()
    mockPipeline.zremrangebyscore.mockReturnThis()
    mockPipeline.zcard.mockReturnThis()
    mockPipeline.zrangebyscore.mockReturnThis()
    mockPipeline.expire.mockReturnThis()
  })

  it('getCounts 應透過 pipeline 查詢 RPM 和 TPM', async () => {
    // results[0]=zremrangebyscore rpm, [1]=zremrangebyscore tpm, [2]=zcard=5, [3]=zrangebyscore members
    mockPipelineExec.mockResolvedValue([undefined, undefined, 5, ['1234:abc:100', '1235:def:200']])

    const backend = new RedisCounterBackend(mockRedisInstance as never)
    const result = await backend.getCounts('test-key')

    expect(result.rpm).toBe(5)
    expect(result.tpm).toBe(300)
    expect(mockRedisPipeline).toHaveBeenCalledTimes(1)
    expect(mockPipeline.zcard).toHaveBeenCalledOnce()
    expect(mockPipeline.zrangebyscore).toHaveBeenCalledOnce()
  })

  it('recordRequest 應使用 ZADD + EXPIRE pipeline', async () => {
    mockPipelineExec.mockResolvedValue([undefined, undefined, undefined, undefined])

    const backend = new RedisCounterBackend(mockRedisInstance as never)
    await backend.recordRequest('test-key', 500)

    expect(mockPipeline.zadd).toHaveBeenCalledTimes(2) // rpm + tpm
    expect(mockPipeline.expire).toHaveBeenCalledTimes(2) // rpm + tpm
    expect(mockPipelineExec).toHaveBeenCalledOnce()
  })

  it('correctTokens delta=0 時不呼叫 Redis', async () => {
    const backend = new RedisCounterBackend(mockRedisInstance as never)
    await backend.correctTokens('test-key', 100, 100)

    expect(mockRedisPipeline).not.toHaveBeenCalled()
    expect(mockPipelineExec).not.toHaveBeenCalled()
  })

  it('correctTokens delta!=0 時應記錄修正 entry', async () => {
    mockPipelineExec.mockResolvedValue([undefined, undefined])

    const backend = new RedisCounterBackend(mockRedisInstance as never)
    await backend.correctTokens('test-key', 100, 150)

    expect(mockPipeline.zadd).toHaveBeenCalledOnce()
    expect(mockPipeline.expire).toHaveBeenCalledOnce()
    expect(mockPipelineExec).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// T6: Fallback 降級測試
// ---------------------------------------------------------------------------

describe('Fallback 降級 — T6', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSingle.mockResolvedValue({ data: { tier: 'free', rpm: 20, tpm: 100000 }, error: null })
  })

  it('UPSTASH_REDIS_REST_URL 未設定時使用 MemoryCounterBackend', () => {
    const originalUrl = process.env.UPSTASH_REDIS_REST_URL
    const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const limiter = createRateLimiter()
    // 驗證行為：MemoryCounterBackend 不呼叫 Redis
    expect(limiter).toBeInstanceOf(RateLimiter)
    expect(MockRedis).not.toHaveBeenCalled()

    process.env.UPSTASH_REDIS_REST_URL = originalUrl
    process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
  })

  it('Redis 操作失敗時應降級至 Memory + console.warn', async () => {
    const errorBackend: import('../RateLimiter.js').CounterBackend = {
      getCounts: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
      recordRequest: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
      correctTokens: vi.fn().mockResolvedValue(undefined),
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const limiter = new RateLimiter(errorBackend)

    // check() should not throw despite backend error
    const result = await limiter.check('key-fallback', 'free', 100)

    expect(result).toBeDefined()
    expect(result.allowed).toBeDefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RateLimiter]'),
      expect.anything(),
    )

    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// T6: Model Override 測試
// ---------------------------------------------------------------------------

describe('Model Override — T6', () => {
  // Helper to build a two-table mock: rate_limit_tiers + model_rate_overrides
  // rate_limit_tiers: .select().eq('tier', tier).single()          — 1 eq
  // model_rate_overrides: .select().eq('tier', t).eq('model_tag', m).single() — 2 eqs
  function setupTwoTableMock(
    tierData: { tier: string; rpm: number; tpm: number },
    overrideData: { rpm: number; tpm: number } | null,
  ) {
    const tierSingle = vi.fn().mockResolvedValue({ data: tierData, error: null })
    const tierEq1 = vi.fn().mockReturnValue({ single: tierSingle })
    const tierSelect = vi.fn().mockReturnValue({ eq: tierEq1 })

    const overrideSingle = vi.fn().mockResolvedValue({
      data: overrideData,
      error: overrideData ? null : { message: 'not found' },
    })
    const overrideEq2 = vi.fn().mockReturnValue({ single: overrideSingle })
    const overrideEq1 = vi.fn().mockReturnValue({ eq: overrideEq2 })
    const overrideSelect = vi.fn().mockReturnValue({ eq: overrideEq1 })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rate_limit_tiers') return { select: tierSelect }
      if (table === 'model_rate_overrides') return { select: overrideSelect }
      return { select: vi.fn() }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有 model override 時應使用 model-specific RPM/TPM limits', async () => {
    setupTwoTableMock(
      { tier: 'pro', rpm: 60, tpm: 500000 },
      { rpm: 10, tpm: 50000 },
    )

    const limiter = new RateLimiter()
    const result = await limiter.check('key-override', 'pro', 100, 'gpt-4')

    expect(result.allowed).toBe(true)
    expect(result.limits.rpm).toBe(10)
    expect(result.limits.tpm).toBe(50000)
  })

  it('無 model override 時應 fallback 到 tier 預設值', async () => {
    setupTwoTableMock(
      { tier: 'pro', rpm: 60, tpm: 500000 },
      null,
    )

    const limiter = new RateLimiter()
    const result = await limiter.check('key-no-override', 'pro', 100, 'gpt-3.5')

    expect(result.allowed).toBe(true)
    expect(result.limits.rpm).toBe(60)
    expect(result.limits.tpm).toBe(500000)
  })

  it('model 參數缺失時應使用 tier 預設值（向後相容）', async () => {
    mockSingle.mockResolvedValue({ data: { tier: 'pro', rpm: 60, tpm: 500000 }, error: null })
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    const limiter = new RateLimiter()
    // No model argument
    const result = await limiter.check('key-no-model', 'pro', 100)

    expect(result.allowed).toBe(true)
    expect(result.limits.rpm).toBe(60)
    expect(result.limits.tpm).toBe(500000)
    // model_rate_overrides should NOT have been queried
    expect(mockFrom).toHaveBeenCalledWith('rate_limit_tiers')
    expect(mockFrom).not.toHaveBeenCalledWith('model_rate_overrides')
  })
})
