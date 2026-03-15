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

const WINDOW_MS = 60_000  // 1 minute sliding window
const CONFIG_CACHE_TTL_MS = 60_000

export class RateLimiter {
  private counters = new Map<string, KeyCounters>()
  private configCache = new Map<string, { config: RateLimitConfig; cachedAt: number }>()
  private db: typeof supabaseAdmin

  constructor(db?: typeof supabaseAdmin) {
    this.db = db ?? supabaseAdmin
  }

  async check(keyId: string, tier: string, estimatedTokens: number): Promise<RateLimitResult> {
    const config = await this.getConfig(tier)

    // Unlimited tier — bypass all checks
    if (config.rpm === -1 && config.tpm === -1) {
      return { allowed: true, limits: { rpm: -1, tpm: -1 }, remaining: { rpm: -1, tpm: -1 } }
    }

    const now = Date.now()
    this.cleanup(keyId, now)

    const counters = this.getOrCreateCounters(keyId)
    const currentRpm = this.sumWindow(counters.requests, now)
    const currentTpm = this.sumWindow(counters.tokens, now)

    const limits = { rpm: config.rpm, tpm: config.tpm }

    // Check RPM
    if (config.rpm !== -1 && currentRpm >= config.rpm) {
      const oldestEntry = counters.requests.find(e => e.timestamp > now - WINDOW_MS)
      const retryAfter = oldestEntry ? Math.ceil((oldestEntry.timestamp + WINDOW_MS - now) / 1000) : 1
      return {
        allowed: false,
        limits,
        remaining: { rpm: 0, tpm: Math.max(0, config.tpm - currentTpm) },
        retryAfter,
      }
    }

    // Check TPM
    if (config.tpm !== -1 && currentTpm + estimatedTokens > config.tpm) {
      const oldestEntry = counters.tokens.find(e => e.timestamp > now - WINDOW_MS)
      const retryAfter = oldestEntry ? Math.ceil((oldestEntry.timestamp + WINDOW_MS - now) / 1000) : 1
      return {
        allowed: false,
        limits,
        remaining: { rpm: Math.max(0, config.rpm - currentRpm - 1), tpm: 0 },
        retryAfter,
      }
    }

    // Record this request
    counters.requests.push({ timestamp: now, count: 1 })
    counters.tokens.push({ timestamp: now, count: estimatedTokens })

    return {
      allowed: true,
      limits,
      remaining: {
        rpm: config.rpm === -1 ? -1 : Math.max(0, config.rpm - currentRpm - 1),
        tpm: config.tpm === -1 ? -1 : Math.max(0, config.tpm - currentTpm - estimatedTokens),
      },
    }
  }

  record(keyId: string, actualTokens: number): void {
    const counters = this.counters.get(keyId)
    if (!counters || counters.tokens.length === 0) return
    // Replace the last token entry's count with actual
    const lastEntry = counters.tokens[counters.tokens.length - 1]
    if (lastEntry) lastEntry.count = actualTokens
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

    const config: RateLimitConfig = { tier: (data as { tier: string; rpm: number; tpm: number }).tier, rpm: (data as { tier: string; rpm: number; tpm: number }).rpm, tpm: (data as { tier: string; rpm: number; tpm: number }).tpm }
    this.configCache.set(tier, { config, cachedAt: Date.now() })
    return config
  }

  private getOrCreateCounters(keyId: string): KeyCounters {
    let c = this.counters.get(keyId)
    if (!c) {
      c = { requests: [], tokens: [] }
      this.counters.set(keyId, c)
    }
    return c
  }

  private cleanup(keyId: string, now: number): void {
    const c = this.counters.get(keyId)
    if (!c) return
    const cutoff = now - WINDOW_MS
    c.requests = c.requests.filter(e => e.timestamp > cutoff)
    c.tokens = c.tokens.filter(e => e.timestamp > cutoff)
  }

  private sumWindow(entries: TimestampedCount[], now: number): number {
    const cutoff = now - WINDOW_MS
    return entries.filter(e => e.timestamp > cutoff).reduce((sum, e) => sum + e.count, 0)
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter()
