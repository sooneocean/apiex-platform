import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase modules
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'user@example.com' } },
        error: null,
      }),
    },
  })),
}))

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {},
  supabaseClient: {},
}))

// Mock WebhookService
const mockWebhookService = {
  getConfig: vi.fn(),
  upsertConfig: vi.fn(),
  deleteConfig: vi.fn(),
  sendNotification: vi.fn(),
  listLogs: vi.fn(),
}

vi.mock('../services/WebhookService.js', () => ({
  WebhookService: vi.fn(() => mockWebhookService),
}))

import { createApp } from '../index.js'

const USER_ID = 'user-1'
const AUTH_HEADER = { Authorization: 'Bearer test-token' }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Webhook Routes', () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  // ── GET /webhooks ─────────────────────────────────────────────────────────

  describe('GET /webhooks', () => {
    it('應回傳用戶 webhook 設定', async () => {
      const config = {
        id: 'cfg-1',
        user_id: USER_ID,
        url: 'https://example.com/hook',
        secret: null,
        events: ['quota_warning'],
        is_active: true,
        created_at: '2026-03-15T00:00:00Z',
      }
      mockWebhookService.getConfig.mockResolvedValue(config)

      const res = await app.request('/webhooks', { headers: AUTH_HEADER })
      expect(res.status).toBe(200)
      const body = await res.json() as { data: typeof config | null }
      expect(body.data).toEqual(config)
    })

    it('無設定時回傳 data: null', async () => {
      mockWebhookService.getConfig.mockResolvedValue(null)
      const res = await app.request('/webhooks', { headers: AUTH_HEADER })
      expect(res.status).toBe(200)
      const body = await res.json() as { data: null }
      expect(body.data).toBeNull()
    })
  })

  // ── POST /webhooks ─────────────────────────────────────────────────────────

  describe('POST /webhooks', () => {
    it('應建立 webhook 設定', async () => {
      const config = {
        id: 'cfg-1',
        user_id: USER_ID,
        url: 'https://example.com/hook',
        secret: 'secret123',
        events: ['quota_warning'],
        is_active: true,
        created_at: '2026-03-15T00:00:00Z',
      }
      mockWebhookService.upsertConfig.mockResolvedValue(config)

      const res = await app.request('/webhooks', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/hook', secret: 'secret123' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { data: typeof config }
      expect(body.data.url).toBe('https://example.com/hook')
    })

    it('缺少 url 時回傳 400', async () => {
      const res = await app.request('/webhooks', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })
  })

  // ── DELETE /webhooks/:id ───────────────────────────────────────────────────

  describe('DELETE /webhooks/:id', () => {
    it('應刪除 webhook 設定', async () => {
      mockWebhookService.deleteConfig.mockResolvedValue(undefined)

      const res = await app.request('/webhooks/cfg-1', {
        method: 'DELETE',
        headers: AUTH_HEADER,
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { data: { deleted: boolean } }
      expect(body.data.deleted).toBe(true)
    })
  })

  // ── GET /webhooks/:id/logs ─────────────────────────────────────────────────

  describe('GET /webhooks/:id/logs', () => {
    it('應回傳推播記錄列表', async () => {
      const config = {
        id: 'cfg-1',
        user_id: USER_ID,
        url: 'https://example.com/hook',
        secret: null,
        events: ['quota_warning'],
        is_active: true,
        created_at: '2026-03-15T00:00:00Z',
      }
      const logs = [
        {
          id: 'log-1',
          webhook_config_id: 'cfg-1',
          event: 'quota_warning',
          payload: { threshold: 80 },
          status_code: 200,
          response_body: 'OK',
          created_at: '2026-03-15T12:00:00Z',
        },
      ]
      mockWebhookService.getConfig.mockResolvedValue(config)
      mockWebhookService.listLogs.mockResolvedValue(logs)

      const res = await app.request('/webhooks/cfg-1/logs', { headers: AUTH_HEADER })
      expect(res.status).toBe(200)
      const body = await res.json() as { data: typeof logs }
      expect(body.data).toHaveLength(1)
      expect(body.data[0].event).toBe('quota_warning')
    })
  })

  // ── POST /webhooks/test ───────────────────────────────────────────────────

  describe('POST /webhooks/test', () => {
    it('應發送測試推播', async () => {
      const logEntry = {
        id: 'log-1',
        webhook_config_id: 'cfg-1',
        event: 'quota_warning',
        payload: {},
        status_code: 200,
        response_body: 'OK',
        created_at: '2026-03-15T12:00:00Z',
      }
      mockWebhookService.sendNotification.mockResolvedValue(logEntry)

      const res = await app.request('/webhooks/test', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { data: typeof logEntry }
      expect(body.data.status_code).toBe(200)
    })

    it('無 webhook 設定時回傳 404', async () => {
      mockWebhookService.sendNotification.mockResolvedValue(null)

      const res = await app.request('/webhooks/test', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(404)
    })
  })
})
