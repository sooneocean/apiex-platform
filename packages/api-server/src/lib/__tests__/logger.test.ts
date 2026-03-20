import { describe, it, expect, vi, beforeEach } from 'vitest'
import { log } from '../logger.js'

describe('Structured Logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should output valid JSON with level, ts, ctx, msg', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.server.info('test message')
    expect(spy).toHaveBeenCalledOnce()
    const output = JSON.parse(spy.mock.calls[0][0] as string)
    expect(output.level).toBe('info')
    expect(output.ctx).toBe('server')
    expect(output.msg).toBe('test message')
    expect(output.ts).toBeDefined()
  })

  it('should serialize Error objects in metadata', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('test error')
    log.proxy.error('something failed', { err })
    const output = JSON.parse(spy.mock.calls[0][0] as string)
    expect(output.level).toBe('error')
    expect(output.err.message).toBe('test error')
    expect(output.err.stack).toContain('test error')
  })

  it('should include arbitrary metadata fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.admin.info('user action', { userId: 'u-1', action: 'delete' })
    const output = JSON.parse(spy.mock.calls[0][0] as string)
    expect(output.userId).toBe('u-1')
    expect(output.action).toBe('delete')
  })

  it('should use console.warn for warn level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    log.rateLimiter.warn('degraded')
    expect(spy).toHaveBeenCalledOnce()
    const output = JSON.parse(spy.mock.calls[0][0] as string)
    expect(output.level).toBe('warn')
  })

  it('should have all expected context loggers', () => {
    expect(log.proxy).toBeDefined()
    expect(log.admin).toBeDefined()
    expect(log.analytics).toBeDefined()
    expect(log.rateLimiter).toBeDefined()
    expect(log.telemetry).toBeDefined()
    expect(log.webhook).toBeDefined()
    expect(log.usage).toBeDefined()
    expect(log.server).toBeDefined()
  })
})
