import type { Context, Next } from 'hono'
import { rateLimiter } from '../lib/RateLimiter.js'
import { RateLimitError } from '../lib/errors.js'

export async function rateLimitMiddleware(c: Context, next: Next) {
  const apiKeyId = c.get('apiKeyId') as string
  const tier = (c.get('apiKeyTier') as string) ?? 'free'

  // Parse body to get estimated tokens
  let estimatedTokens = 4096
  try {
    const body = await c.req.json()
    if (body.max_tokens && typeof body.max_tokens === 'number') {
      estimatedTokens = body.max_tokens
    }
  } catch { /* body parse failed — use default */ }

  const result = await rateLimiter.check(apiKeyId, tier, estimatedTokens)

  if (!result.allowed) {
    const headers: Record<string, string> = {
      'X-RateLimit-Limit-Requests': String(result.limits.rpm),
      'X-RateLimit-Limit-Tokens': String(result.limits.tpm),
      'X-RateLimit-Remaining-Requests': String(result.remaining.rpm),
      'X-RateLimit-Remaining-Tokens': String(result.remaining.tpm),
    }
    throw new RateLimitError(result.retryAfter ?? 1, headers)
  }

  await next()

  // Add rate limit headers to response (only for non-unlimited tiers)
  if (result.limits.rpm !== -1) {
    c.header('X-RateLimit-Limit-Requests', String(result.limits.rpm))
    c.header('X-RateLimit-Limit-Tokens', String(result.limits.tpm))
    c.header('X-RateLimit-Remaining-Requests', String(result.remaining.rpm))
    c.header('X-RateLimit-Remaining-Tokens', String(result.remaining.tpm))
  }
}
