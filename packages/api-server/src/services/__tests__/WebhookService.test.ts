import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}))

// 用 vi.hoisted 確保變數在 mock factory 執行時已初始化
const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
  },
  supabaseClient: {},
}))

import { WebhookService } from '../WebhookService.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 建立一個 fluent Supabase query chain mock，最終 resolve 給定的結果 */
function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'insert', 'update', 'upsert', 'delete', 'single', 'limit', 'order', 'gte', 'maybeSingle']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  // 讓整個 chain 也是 thenable（await chain 會得到 resolveValue）
  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(resolve)
  return chain
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebhookService', () => {
  let service: WebhookService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new WebhookService()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── getConfig ──────────────────────────────────────────────────────────────

  describe('getConfig', () => {
    it('應回傳用戶的 webhook 設定', async () => {
      const config = {
        id: 'cfg-1',
        user_id: 'user-1',
        url: 'https://example.com/hook',
        secret: null,
        events: ['quota_warning'],
        is_active: true,
        created_at: '2026-03-15T00:00:00Z',
      }
      const chain = makeChain({ data: config, error: null })
      mockFrom.mockReturnValue(chain)

      const result = await service.getConfig('user-1')
      expect(result).toEqual(config)
    })

    it('查無設定時回傳 null', async () => {
      const chain = makeChain({ data: null, error: { code: 'PGRST116' } })
      mockFrom.mockReturnValue(chain)

      const result = await service.getConfig('user-1')
      expect(result).toBeNull()
    })
  })

  // ── upsertConfig ───────────────────────────────────────────────────────────

  describe('upsertConfig', () => {
    it('應建立或更新 webhook 設定', async () => {
      const config = {
        id: 'cfg-1',
        user_id: 'user-1',
        url: 'https://example.com/hook',
        secret: 'mysecret',
        events: ['quota_warning'],
        is_active: true,
        created_at: '2026-03-15T00:00:00Z',
      }
      const chain = makeChain({ data: config, error: null })
      mockFrom.mockReturnValue(chain)

      const result = await service.upsertConfig('user-1', 'https://example.com/hook', 'mysecret')
      expect(result).toEqual(config)
    })

    it('URL 格式無效時應拋出錯誤', async () => {
      await expect(service.upsertConfig('user-1', 'not-a-url')).rejects.toThrow('Invalid webhook URL')
    })
  })

  // ── deleteConfig ───────────────────────────────────────────────────────────

  describe('deleteConfig', () => {
    it('應刪除指定 webhook 設定', async () => {
      const chain = makeChain({ error: null })
      mockFrom.mockReturnValue(chain)

      await expect(service.deleteConfig('user-1', 'cfg-1')).resolves.toBeUndefined()
    })
  })

  // ── sendNotification ───────────────────────────────────────────────────────

  describe('sendNotification', () => {
    const userId = 'user-1'
    const configId = 'cfg-1'

    it('無 webhook 設定時應靜默返回 null', async () => {
      const getConfigSpy = vi.spyOn(service, 'getConfig').mockResolvedValue(null)
      const result = await service.sendNotification(userId, 'quota_warning', { key_id: 'k1' })
      expect(result).toBeNull()
      getConfigSpy.mockRestore()
    })

    it('is_active=false 時應靜默返回 null', async () => {
      vi.spyOn(service, 'getConfig').mockResolvedValue({
        id: configId,
        user_id: userId,
        url: 'https://example.com/hook',
        secret: null,
        events: ['quota_warning'],
        is_active: false,
        created_at: '2026-03-15T00:00:00Z',
      })
      const result = await service.sendNotification(userId, 'quota_warning', {})
      expect(result).toBeNull()
    })

    it('應 POST 到 webhook URL 並記錄 log（無 secret）', async () => {
      vi.spyOn(service, 'getConfig').mockResolvedValue({
        id: configId,
        user_id: userId,
        url: 'https://example.com/hook',
        secret: null,
        events: ['quota_warning'],
        is_active: true,
        created_at: '2026-03-15T00:00:00Z',
      })

      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('OK'),
      })
      vi.stubGlobal('fetch', fetchMock)

      const logRecord = {
        id: 'log-1',
        webhook_config_id: configId,
        event: 'quota_warning',
        payload: { key_id: 'k1' },
        status_code: 200,
        response_body: 'OK',
        created_at: '2026-03-15T12:00:00Z',
      }
      const chain = makeChain({ data: logRecord, error: null })
      mockFrom.mockReturnValue(chain)

      const result = await service.sendNotification(userId, 'quota_warning', { key_id: 'k1' })

      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://example.com/hook')
      expect(opts.method).toBe('POST')
      const body = JSON.parse(opts.body as string)
      expect(body.event).toBe('quota_warning')
      expect(result?.status_code).toBe(200)
    })

    it('有 secret 時應附加 X-Webhook-Signature header', async () => {
      vi.spyOn(service, 'getConfig').mockResolvedValue({
        id: configId,
        user_id: userId,
        url: 'https://example.com/hook',
        secret: 'mysecret',
        events: ['quota_warning'],
        is_active: true,
        created_at: '2026-03-15T00:00:00Z',
      })

      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('OK'),
      })
      vi.stubGlobal('fetch', fetchMock)

      const chain = makeChain({ data: { id: 'log-1' }, error: null })
      mockFrom.mockReturnValue(chain)

      await service.sendNotification(userId, 'quota_warning', { key_id: 'k1' })

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
      const headers = opts.headers as Record<string, string>
      expect(headers['X-Webhook-Signature']).toMatch(/^sha256=/)
    })

    it('fetch 拋出錯誤時應記錄 log（status_code=null）並靜默返回', async () => {
      vi.spyOn(service, 'getConfig').mockResolvedValue({
        id: configId,
        user_id: userId,
        url: 'https://example.com/hook',
        secret: null,
        events: ['quota_warning'],
        is_active: true,
        created_at: '2026-03-15T00:00:00Z',
      })

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const logRecord = {
        id: 'log-1',
        webhook_config_id: configId,
        event: 'quota_warning',
        payload: {},
        status_code: null,
        response_body: 'Network error',
        created_at: '2026-03-15T12:00:00Z',
      }
      const chain = makeChain({ data: logRecord, error: null })
      mockFrom.mockReturnValue(chain)

      const result = await service.sendNotification(userId, 'quota_warning', {})
      expect(result?.status_code).toBeNull()
    })
  })

  // ── checkAndNotifyQuota ───────────────────────────────────────────────────

  describe('checkAndNotifyQuota', () => {
    const userId = 'user-1'
    const keyId = 'key-1'

    it('quota_tokens=-1（無限）時不應觸發通知', async () => {
      const spy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      await service.checkAndNotifyQuota(userId, keyId, -1, 99999)
      expect(spy).not.toHaveBeenCalled()
    })

    it('quota_tokens=0 時不應觸發通知', async () => {
      const spy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      await service.checkAndNotifyQuota(userId, keyId, 0, 0)
      expect(spy).not.toHaveBeenCalled()
    })

    it('未達 80% 時不應觸發通知', async () => {
      const spy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      // quota=100000，used=70000（70%），remaining=30000
      // 消耗 = quota - remaining = 70000，消耗比 = 70%
      await service.checkAndNotifyQuota(userId, keyId, 100000, 70000)
      expect(spy).not.toHaveBeenCalled()
    })

    it('消耗達 80% 時觸發 threshold=80 通知', async () => {
      vi.spyOn(service, '_hasRecentLog').mockResolvedValue(false)
      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
        id: 'log-1', webhook_config_id: 'cfg-1', event: 'quota_warning',
        payload: {}, status_code: 200, response_body: 'OK', created_at: ''
      })
      // quota=100000，remaining=18000，消耗=82000（82%）→ 達 80%
      await service.checkAndNotifyQuota(userId, keyId, 100000, 82000)
      expect(sendSpy).toHaveBeenCalledOnce()
      const payload = sendSpy.mock.calls[0][2] as Record<string, unknown>
      expect(payload.threshold).toBe(80)
    })

    it('消耗達 90% 時觸發 threshold=90 通知', async () => {
      vi.spyOn(service, '_hasRecentLog').mockResolvedValue(false)
      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
        id: 'log-1', webhook_config_id: 'cfg-1', event: 'quota_warning',
        payload: {}, status_code: 200, response_body: 'OK', created_at: ''
      })
      // quota=100000，remaining=8000，消耗=92000（92%）→ 達 90%（最高吻合）
      await service.checkAndNotifyQuota(userId, keyId, 100000, 92000)
      expect(sendSpy).toHaveBeenCalledOnce()
      const payload = sendSpy.mock.calls[0][2] as Record<string, unknown>
      expect(payload.threshold).toBe(90)
    })

    it('消耗達 100% 時觸發 threshold=100 通知', async () => {
      vi.spyOn(service, '_hasRecentLog').mockResolvedValue(false)
      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
        id: 'log-1', webhook_config_id: 'cfg-1', event: 'quota_warning',
        payload: {}, status_code: 200, response_body: 'OK', created_at: ''
      })
      // quota=100000，remaining=0，消耗=100000（100%）
      await service.checkAndNotifyQuota(userId, keyId, 100000, 100000)
      expect(sendSpy).toHaveBeenCalledOnce()
      const payload = sendSpy.mock.calls[0][2] as Record<string, unknown>
      expect(payload.threshold).toBe(100)
    })

    it('24h 內已發送過相同閾值不應重複觸發', async () => {
      vi.spyOn(service, '_hasRecentLog').mockResolvedValue(true) // 已有記錄
      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      await service.checkAndNotifyQuota(userId, keyId, 100000, 82000)
      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('payload 應包含正確的欄位', async () => {
      vi.spyOn(service, '_hasRecentLog').mockResolvedValue(false)
      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
        id: 'log-1', webhook_config_id: 'cfg-1', event: 'quota_warning',
        payload: {}, status_code: 200, response_body: 'OK', created_at: ''
      })
      // quota=100000，remaining=18000，消耗=82000（82%）→ threshold=80
      await service.checkAndNotifyQuota(userId, keyId, 100000, 82000)
      const payload = sendSpy.mock.calls[0][2] as Record<string, unknown>
      expect(payload).toMatchObject({
        event: 'quota_warning',
        threshold: 80,
        key_id: keyId,
        quota_tokens: 100000,
      })
      expect(typeof payload.timestamp).toBe('string')
    })
  })
})
