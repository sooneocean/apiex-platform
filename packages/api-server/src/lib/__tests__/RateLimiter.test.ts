/**
 * T3 TDD — RateLimiter 測試（9 test cases）
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

const { RateLimiter } = await import('../RateLimiter.js')

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
