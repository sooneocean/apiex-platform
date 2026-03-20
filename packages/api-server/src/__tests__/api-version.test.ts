import { describe, it, expect } from 'vitest'
import { createApp } from '../index.js'

describe('API Version Header', () => {
  const app = createApp()

  it('should include X-API-Version header on /health', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('X-API-Version')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('/health should return version in body', async () => {
    const res = await app.request('/health')
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.version).toBeDefined()
    expect(body.timestamp).toBeDefined()
  })
})
