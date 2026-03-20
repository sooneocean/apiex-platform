/**
 * Structured JSON logger for production observability.
 * Outputs one JSON line per log entry — compatible with
 * CloudWatch, Datadog, ELK, and any JSON-aware log aggregator.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  ts: string
  ctx: string
  msg: string
  [key: string]: unknown
}

function serialize(level: LogLevel, ctx: string, msg: string, meta?: Record<string, unknown>): string {
  const entry: LogEntry = {
    level,
    ts: new Date().toISOString(),
    ctx,
    msg,
  }
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (v instanceof Error) {
        entry[k] = { message: v.message, stack: v.stack }
      } else {
        entry[k] = v
      }
    }
  }
  return JSON.stringify(entry)
}

function createLogger(ctx: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => console.log(serialize('debug', ctx, msg, meta)),
    info: (msg: string, meta?: Record<string, unknown>) => console.log(serialize('info', ctx, msg, meta)),
    warn: (msg: string, meta?: Record<string, unknown>) => console.warn(serialize('warn', ctx, msg, meta)),
    error: (msg: string, meta?: Record<string, unknown>) => console.error(serialize('error', ctx, msg, meta)),
  }
}

export const log = {
  proxy: createLogger('proxy'),
  admin: createLogger('admin'),
  analytics: createLogger('analytics'),
  rateLimiter: createLogger('rate-limiter'),
  telemetry: createLogger('telemetry'),
  webhook: createLogger('webhook'),
  usage: createLogger('usage'),
  server: createLogger('server'),
}
