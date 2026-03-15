import { Redis } from '@upstash/redis'
import { supabaseAdmin } from './supabase.js'

interface TimestampedCount {
  timestamp: number
  count: number
}

interface KeyCounters {
  requests: TimestampedCount[]
  tokens: TimestampedCount[]
}

export interface RateLimitConfig {
  tier: string
  rpm: number
  tpm: number
}

export interface RateLimitResult {
  allowed: boolean
  limits: { rpm: number; tpm: number }
  remaining: { rpm: number; tpm: number }
  retryAfter?: number
}

export interface CounterBackend {
  getCounts(key: string): Promise<{ rpm: number; tpm: number }>
  recordRequest(key: string, tokens: number): Promise<void>
  correctTokens(key: string, estimatedTokens: number, actualTokens: number): Promise<void>
}

const WINDOW_MS = 60_000  // 1 minute sliding window
const CONFIG_CACHE_TTL_MS = 60_000

export class MemoryCounterBackend implements CounterBackend {
  private counters = new Map<string, KeyCounters>()

  private getOrCreate(key: string): KeyCounters {
    let c = this.counters.get(key)
    if (!c) {
      c = { requests: [], tokens: [] }
      this.counters.set(key, c)
    }
    return c
  }

  private cleanup(key: string, now: number): void {
    const c = this.counters.get(key)
    if (!c) return
    const cutoff = now - WINDOW_MS
    c.requests = c.requests.filter(e => e.timestamp > cutoff)
    c.tokens = c.tokens.filter(e => e.timestamp > cutoff)
  }

  private sumWindow(entries: TimestampedCount[], now: number): number {
    const cutoff = now - WINDOW_MS
    return entries.filter(e => e.timestamp > cutoff).reduce((sum, e) => sum + e.count, 0)
  }

  async getCounts(key: string): Promise<{ rpm: number; tpm: number }> {
    const now = Date.now()
    this.cleanup(key, now)
    const counters = this.getOrCreate(key)
    return {
      rpm: this.sumWindow(counters.requests, now),
      tpm: this.sumWindow(counters.tokens, now),
    }
  }

  async recordRequest(key: string, tokens: number): Promise<void> {
    const now = Date.now()
    const counters = this.getOrCreate(key)
    counters.requests.push({ timestamp: now, count: 1 })
    counters.tokens.push({ timestamp: now, count: tokens })
  }

  async correctTokens(key: string, estimatedTokens: number, actualTokens: number): Promise<void> {
    const counters = this.counters.get(key)
    if (!counters || counters.tokens.length === 0) return
    // Replace the last token entry's count with actual
    const lastEntry = counters.tokens[counters.tokens.length - 1]
    if (lastEntry) lastEntry.count = actualTokens
  }
}

export class RedisCounterBackend implements CounterBackend {
  private redis: Redis
  private WINDOW_MS = 60_000
  private KEY_TTL = 120 // 2x window

  constructor(redis: Redis) { this.redis = redis }

  async getCounts(key: string): Promise<{ rpm: number; tpm: number }> {
    const now = Date.now()
    const windowStart = now - this.WINDOW_MS
    const rpmKey = `rl:${key}:rpm`
    const tpmKey = `rl:${key}:tpm`

    // Pipeline: cleanup + count
    const pipeline = this.redis.pipeline()
    pipeline.zremrangebyscore(rpmKey, 0, windowStart)
    pipeline.zremrangebyscore(tpmKey, 0, windowStart)
    pipeline.zcard(rpmKey)
    pipeline.zrangebyscore(tpmKey, windowStart, '+inf')

    const results = await pipeline.exec()
    const rpm = (results[2] as number) ?? 0
    const tpmMembers = (results[3] as string[]) ?? []

    // Parse TPM: members are "{ts}:{rand}:{count}"
    let tpm = 0
    for (const member of tpmMembers) {
      const parts = String(member).split(':')
      const count = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(count)) tpm += count
    }

    return { rpm, tpm }
  }

  async recordRequest(key: string, tokens: number): Promise<void> {
    const now = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const rpmKey = `rl:${key}:rpm`
    const tpmKey = `rl:${key}:tpm`

    const pipeline = this.redis.pipeline()
    pipeline.zadd(rpmKey, { score: now, member: `${now}:${rand}` })
    pipeline.expire(rpmKey, this.KEY_TTL)
    pipeline.zadd(tpmKey, { score: now, member: `${now}:${rand}:${tokens}` })
    pipeline.expire(tpmKey, this.KEY_TTL)
    await pipeline.exec()
  }

  async correctTokens(key: string, estimatedTokens: number, actualTokens: number): Promise<void> {
    // For Redis, correction is a no-op if difference is small
    // The estimated value was already recorded; we add a correction entry
    const delta = actualTokens - estimatedTokens
    if (delta === 0) return

    const now = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const tpmKey = `rl:${key}:tpm`

    // Add correction entry (can be negative via the delta approach)
    const pipeline = this.redis.pipeline()
    pipeline.zadd(tpmKey, { score: now, member: `${now}:${rand}:${delta}` })
    pipeline.expire(tpmKey, this.KEY_TTL)
    await pipeline.exec()
  }
}

export class RateLimiter {
  private backend: CounterBackend
  private configCache = new Map<string, { config: RateLimitConfig; cachedAt: number }>()
  private modelOverrideCache: Map<string, { config: { rpm: number; tpm: number } | null; cachedAt: number }> = new Map()
  private db: typeof supabaseAdmin

  constructor(backend?: CounterBackend, db?: typeof supabaseAdmin) {
    this.backend = backend ?? new MemoryCounterBackend()
    this.db = db ?? supabaseAdmin
  }

  async getModelConfig(tier: string, model: string): Promise<{ rpm: number; tpm: number } | null> {
    const cacheKey = `${tier}:${model}`
    const cached = this.modelOverrideCache.get(cacheKey)
    if (cached && Date.now() - cached.cachedAt < CONFIG_CACHE_TTL_MS) {
      return cached.config
    }

    const { data, error } = await this.db
      .from('model_rate_overrides')
      .select('rpm, tpm')
      .eq('tier', tier)
      .eq('model_tag', model)
      .single()

    if (error || !data) {
      this.modelOverrideCache.set(cacheKey, { config: null, cachedAt: Date.now() })
      return null
    }

    const config = {
      rpm: (data as { rpm: number; tpm: number }).rpm,
      tpm: (data as { rpm: number; tpm: number }).tpm,
    }
    this.modelOverrideCache.set(cacheKey, { config, cachedAt: Date.now() })
    return config
  }

  async check(keyId: string, tier: string, estimatedTokens: number, model?: string): Promise<RateLimitResult> {
    const config = await this.getConfig(tier)

    // Unlimited tier — bypass all checks
    if (config.rpm === -1 && config.tpm === -1) {
      return { allowed: true, limits: { rpm: -1, tpm: -1 }, remaining: { rpm: -1, tpm: -1 } }
    }

    // Resolve model-level override if model is provided
    let effectiveLimits = { rpm: config.rpm, tpm: config.tpm }
    let counterKey = keyId
    if (model) {
      const override = await this.getModelConfig(tier, model)
      if (override) {
        effectiveLimits = { rpm: override.rpm, tpm: override.tpm }
        counterKey = `${keyId}:${model}`
      }
    }

    let counts: { rpm: number; tpm: number }
    try {
      counts = await this.backend.getCounts(counterKey)
    } catch (err) {
      console.warn('[RateLimiter] Backend error in getCounts, degrading to memory for this call:', err)
      const memBackend = new MemoryCounterBackend()
      counts = await memBackend.getCounts(counterKey)
    }

    const { rpm: currentRpm, tpm: currentTpm } = counts
    const limits = { rpm: effectiveLimits.rpm, tpm: effectiveLimits.tpm }

    // Check RPM
    if (effectiveLimits.rpm !== -1 && currentRpm >= effectiveLimits.rpm) {
      return {
        allowed: false,
        limits,
        remaining: { rpm: 0, tpm: Math.max(0, effectiveLimits.tpm - currentTpm) },
        retryAfter: 1,
      }
    }

    // Check TPM
    if (effectiveLimits.tpm !== -1 && currentTpm + estimatedTokens > effectiveLimits.tpm) {
      return {
        allowed: false,
        limits,
        remaining: { rpm: Math.max(0, effectiveLimits.rpm - currentRpm - 1), tpm: 0 },
        retryAfter: 1,
      }
    }

    // Record this request
    try {
      await this.backend.recordRequest(counterKey, estimatedTokens)
    } catch (err) {
      console.warn('[RateLimiter] Backend error in recordRequest, skipping record:', err)
    }

    return {
      allowed: true,
      limits,
      remaining: {
        rpm: effectiveLimits.rpm === -1 ? -1 : Math.max(0, effectiveLimits.rpm - currentRpm - 1),
        tpm: effectiveLimits.tpm === -1 ? -1 : Math.max(0, effectiveLimits.tpm - currentTpm - estimatedTokens),
      },
    }
  }

  record(keyId: string, actualTokens: number, model?: string): void {
    const counterKey = model ? `${keyId}:${model}` : keyId
    // Fire-and-forget; ignore errors silently
    this.backend.correctTokens(counterKey, 0, actualTokens).catch(err => {
      console.warn('[RateLimiter] Backend error in correctTokens:', err)
    })
  }

  async getConfig(tier: string): Promise<RateLimitConfig> {
    const cached = this.configCache.get(tier)
    if (cached && Date.now() - cached.cachedAt < CONFIG_CACHE_TTL_MS) {
      return cached.config
    }

    const { data, error } = await this.db
      .from('rate_limit_tiers')
      .select('tier, rpm, tpm')
      .eq('tier', tier)
      .single()

    if (error || !data) {
      // Fallback to free tier defaults
      return { tier: 'free', rpm: 20, tpm: 100_000 }
    }

    const config: RateLimitConfig = {
      tier: (data as { tier: string; rpm: number; tpm: number }).tier,
      rpm: (data as { tier: string; rpm: number; tpm: number }).rpm,
      tpm: (data as { tier: string; rpm: number; tpm: number }).tpm,
    }
    this.configCache.set(tier, { config, cachedAt: Date.now() })
    return config
  }
}

export function createRateLimiter(): RateLimiter {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
      console.log('[RateLimiter] Using Redis backend (Upstash)')
      return new RateLimiter(new RedisCounterBackend(redis))
    } catch (err) {
      console.warn('[RateLimiter] Failed to initialize Redis, falling back to memory:', err)
    }
  }
  console.log('[RateLimiter] Using memory backend')
  return new RateLimiter(new MemoryCounterBackend())
}

// Singleton instance
export const rateLimiter = createRateLimiter()
