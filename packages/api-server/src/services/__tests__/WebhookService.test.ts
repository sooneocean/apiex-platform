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
  const methods = ['select', 'eq', 'insert', 'update', 'upsert', 'delete', 'single', 'limit', 'order', 'gte', 'maybeSingle', 'range', 'in']
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
    // Skip SSRF DNS validation in tests
    vi.spyOn(service, '_validateUrlSafety').mockResolvedValue(undefined)
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
    it('應建立或更新 webhook 設定（回傳不含 secret）', async () => {
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
      expect(result.secret).toBeNull()
      expect(result.url).toBe('https://example.com/hook')
      expect(result.id).toBe('cfg-1')
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
      const spy = vi.spyOn(service as never, '_getConfigWithSecret').mockResolvedValue(null)
      const result = await service.sendNotification(userId, 'quota_warning', { key_id: 'k1' })
      expect(result).toBeNull()
      spy.mockRestore()
    })

    it('is_active=false 時應靜默返回 null', async () => {
      vi.spyOn(service as never, '_getConfigWithSecret').mockResolvedValue({
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
      vi.spyOn(service as never, '_getConfigWithSecret').mockResolvedValue({
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
      vi.spyOn(service as never, '_getConfigWithSecret').mockResolvedValue({
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
      vi.spyOn(service as never, '_getConfigWithSecret').mockResolvedValue({
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

  // ── _checkDedup ───────────────────────────────────────────────────────────

  describe('_checkDedup', () => {
    it('1h 內有記錄時回傳 true（已通知）', async () => {
      const chain = makeChain({ data: [{ id: 'nl-1' }], error: null })
      mockFrom.mockReturnValue(chain)

      const result = await service._checkDedup('quota_warning', 'key-1')
      expect(result).toBe(true)
    })

    it('1h 內無記錄時回傳 false（允許通知）', async () => {
      const chain = makeChain({ data: [], error: null })
      mockFrom.mockReturnValue(chain)

      const result = await service._checkDedup('quota_warning', 'key-1')
      expect(result).toBe(false)
    })
  })

  // ── checkAndNotifyQuota (refactored) ──────────────────────────────────────

  describe('checkAndNotifyQuota', () => {
    const userId = 'user-1'
    const keyId = 'key-1'

    it('quota_tokens = -1（無限）時不應觸發通知', async () => {
      // api_keys 查詢回傳 -1（無限）
      const keyChain = makeChain({ data: { quota_tokens: -1, prefix: 'apx-sk-a', user_id: userId }, error: null })
      mockFrom.mockReturnValue(keyChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      await service.checkAndNotifyQuota(userId, keyId)
      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('quota_warning 觸發：剩餘 < 20% 且 > 0', async () => {
      // 原始配額 100000，剩餘 15000（15% < 20%）
      const keyChain = makeChain({ data: { quota_tokens: 15000, prefix: 'apx-sk-a', user_id: userId }, error: null })
      const quotaChain = makeChain({ data: { default_quota_tokens: 100000 }, error: null })
      const dedupChain = makeChain({ data: [], error: null })
      const insertChain = makeChain({ data: { id: 'nl-1' }, error: null })
      const logChain = makeChain({ data: { id: 'log-1', status_code: 200 }, error: null })

      mockFrom
        .mockReturnValueOnce(keyChain)    // api_keys select
        .mockReturnValueOnce(quotaChain)  // user_quotas select
        .mockReturnValueOnce(dedupChain)  // notification_logs dedup check
        .mockReturnValueOnce(keyChain)    // getConfig (sendNotification)
        .mockReturnValueOnce(logChain)    // webhook_logs insert
        .mockReturnValueOnce(insertChain) // notification_logs insert

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
        id: 'log-1', webhook_config_id: 'cfg-1', event: 'quota_warning',
        payload: {}, status_code: 200, response_body: 'OK', created_at: '',
      })

      await service.checkAndNotifyQuota(userId, keyId)
      expect(sendSpy).toHaveBeenCalledOnce()

      const [, eventArg, payloadArg] = sendSpy.mock.calls[0]
      expect(eventArg).toBe('quota_warning')
      const p = payloadArg as Record<string, unknown>
      expect(p.event_type).toBe('quota_warning')
      expect(p.key_id).toBe(keyId)
      expect(p.current_value).toBe(15000)
      expect(p.threshold).toBe(20000) // Math.floor(100000 * 0.2)
      expect(typeof p.timestamp).toBe('string')
    })

    it('quota_exhausted 觸發：剩餘 = 0', async () => {
      const keyChain = makeChain({ data: { quota_tokens: 0, prefix: 'apx-sk-a', user_id: userId }, error: null })
      const quotaChain = makeChain({ data: { default_quota_tokens: 100000 }, error: null })
      const dedupChain = makeChain({ data: [], error: null })
      const insertChain = makeChain({ data: { id: 'nl-1' }, error: null })

      mockFrom
        .mockReturnValueOnce(keyChain)
        .mockReturnValueOnce(quotaChain)
        .mockReturnValueOnce(dedupChain)
        .mockReturnValueOnce(insertChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
        id: 'log-1', webhook_config_id: 'cfg-1', event: 'quota_exhausted',
        payload: {}, status_code: 200, response_body: 'OK', created_at: '',
      })

      await service.checkAndNotifyQuota(userId, keyId)
      expect(sendSpy).toHaveBeenCalledOnce()

      const [, eventArg, payloadArg] = sendSpy.mock.calls[0]
      expect(eventArg).toBe('quota_exhausted')
      const p = payloadArg as Record<string, unknown>
      expect(p.event_type).toBe('quota_exhausted')
      expect(p.current_value).toBe(0)
      expect(p.threshold).toBe(100000)
    })

    it('剩餘 >= 20% 時不應觸發通知', async () => {
      // 原始配額 100000，剩餘 30000（30% >= 20%）
      const keyChain = makeChain({ data: { quota_tokens: 30000, prefix: 'apx-sk-a', user_id: userId }, error: null })
      const quotaChain = makeChain({ data: { default_quota_tokens: 100000 }, error: null })

      mockFrom
        .mockReturnValueOnce(keyChain)
        .mockReturnValueOnce(quotaChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      await service.checkAndNotifyQuota(userId, keyId)
      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('dedup：1h 內已通知同一事件不應重複發送', async () => {
      const keyChain = makeChain({ data: { quota_tokens: 10000, prefix: 'apx-sk-a', user_id: userId }, error: null })
      const quotaChain = makeChain({ data: { default_quota_tokens: 100000 }, error: null })
      const dedupChain = makeChain({ data: [{ id: 'nl-1' }], error: null }) // 已有記錄

      mockFrom
        .mockReturnValueOnce(keyChain)
        .mockReturnValueOnce(quotaChain)
        .mockReturnValueOnce(dedupChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      await service.checkAndNotifyQuota(userId, keyId)
      expect(sendSpy).not.toHaveBeenCalled()
    })
  })

  // ── checkAndNotifySpend ───────────────────────────────────────────────────

  describe('checkAndNotifySpend', () => {
    const userId = 'user-1'
    const keyId = 'key-1'

    it('spend_limit_usd = -1（無限）時不應觸發通知', async () => {
      const keyChain = makeChain({ data: { spent_usd: 90, spend_limit_usd: -1, prefix: 'apx-sk-a' }, error: null })
      mockFrom.mockReturnValue(keyChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      await service.checkAndNotifySpend(userId, keyId)
      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('spent_usd = 0 時不應觸發通知', async () => {
      const keyChain = makeChain({ data: { spent_usd: 0, spend_limit_usd: 100, prefix: 'apx-sk-a' }, error: null })
      mockFrom.mockReturnValue(keyChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      await service.checkAndNotifySpend(userId, keyId)
      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('spend_warning 觸發：spent > 80% 且 < 100%（spent=85, limit=100）', async () => {
      const keyChain = makeChain({ data: { spent_usd: 85, spend_limit_usd: 100, prefix: 'apx-sk-a' }, error: null })
      const dedupChain = makeChain({ data: [], error: null })
      const insertChain = makeChain({ data: { id: 'nl-1' }, error: null })

      mockFrom
        .mockReturnValueOnce(keyChain)
        .mockReturnValueOnce(dedupChain)
        .mockReturnValueOnce(insertChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
        id: 'log-1', webhook_config_id: 'cfg-1', event: 'spend_warning',
        payload: {}, status_code: 200, response_body: 'OK', created_at: '',
      })

      await service.checkAndNotifySpend(userId, keyId)
      expect(sendSpy).toHaveBeenCalledOnce()

      const [, eventArg, payloadArg] = sendSpy.mock.calls[0]
      expect(eventArg).toBe('spend_warning')
      const p = payloadArg as Record<string, unknown>
      expect(p.event_type).toBe('spend_warning')
      expect(p.key_id).toBe(keyId)
      expect(p.current_value).toBe(85)
      expect(p.threshold).toBe(80) // Math.floor(100 * 0.8)
      expect(typeof p.timestamp).toBe('string')
      expect(p.key_prefix).toBe('apx-sk-a')
    })

    it('spend_limit_reached 觸發：spent >= limit（spent=100, limit=100）', async () => {
      const keyChain = makeChain({ data: { spent_usd: 100, spend_limit_usd: 100, prefix: 'apx-sk-a' }, error: null })
      const dedupChain = makeChain({ data: [], error: null })
      const insertChain = makeChain({ data: { id: 'nl-1' }, error: null })

      mockFrom
        .mockReturnValueOnce(keyChain)
        .mockReturnValueOnce(dedupChain)
        .mockReturnValueOnce(insertChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
        id: 'log-1', webhook_config_id: 'cfg-1', event: 'spend_limit_reached',
        payload: {}, status_code: 200, response_body: 'OK', created_at: '',
      })

      await service.checkAndNotifySpend(userId, keyId)
      expect(sendSpy).toHaveBeenCalledOnce()

      const [, eventArg, payloadArg] = sendSpy.mock.calls[0]
      expect(eventArg).toBe('spend_limit_reached')
      const p = payloadArg as Record<string, unknown>
      expect(p.event_type).toBe('spend_limit_reached')
      expect(p.current_value).toBe(100)
      expect(p.threshold).toBe(100)
    })

    it('spent <= 80% 時不應觸發通知', async () => {
      const keyChain = makeChain({ data: { spent_usd: 70, spend_limit_usd: 100, prefix: 'apx-sk-a' }, error: null })
      mockFrom.mockReturnValue(keyChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      await service.checkAndNotifySpend(userId, keyId)
      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('dedup：1h 內已通知同一事件不應重複發送', async () => {
      const keyChain = makeChain({ data: { spent_usd: 85, spend_limit_usd: 100, prefix: 'apx-sk-a' }, error: null })
      const dedupChain = makeChain({ data: [{ id: 'nl-1' }], error: null }) // 已有記錄

      mockFrom
        .mockReturnValueOnce(keyChain)
        .mockReturnValueOnce(dedupChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue(null)
      await service.checkAndNotifySpend(userId, keyId)
      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('統一 payload 應包含所有必要欄位：event_type, key_id, key_prefix, current_value, threshold, timestamp', async () => {
      const keyChain = makeChain({ data: { spent_usd: 95, spend_limit_usd: 100, prefix: 'apx-sk-test' }, error: null })
      const dedupChain = makeChain({ data: [], error: null })
      const insertChain = makeChain({ data: { id: 'nl-1' }, error: null })

      mockFrom
        .mockReturnValueOnce(keyChain)
        .mockReturnValueOnce(dedupChain)
        .mockReturnValueOnce(insertChain)

      const sendSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
        id: 'log-1', webhook_config_id: 'cfg-1', event: 'spend_warning',
        payload: {}, status_code: 200, response_body: 'OK', created_at: '',
      })

      await service.checkAndNotifySpend(userId, keyId)

      const payloadArg = sendSpy.mock.calls[0][2] as Record<string, unknown>
      expect(payloadArg).toHaveProperty('event_type')
      expect(payloadArg).toHaveProperty('key_id')
      expect(payloadArg).toHaveProperty('key_prefix')
      expect(payloadArg).toHaveProperty('current_value')
      expect(payloadArg).toHaveProperty('threshold')
      expect(payloadArg).toHaveProperty('timestamp')
      expect(payloadArg.key_prefix).toBe('apx-sk-test')
    })
  })

  // ── notification_logs dedup（邊界測試）────────────────────────────────────

  describe('notification_logs dedup 邊界', () => {
    it('dedup 1h 內不重複：_checkDedup 查到 1h 內記錄 → 回傳 true', async () => {
      const chain = makeChain({ data: [{ id: 'nl-old' }], error: null })
      mockFrom.mockReturnValue(chain)

      const alreadySent = await service._checkDedup('quota_warning', 'key-1')
      expect(alreadySent).toBe(true)
      // 確認查詢條件有用到 gte（1h 時間視窗）
      expect(chain.gte).toHaveBeenCalled()
    })

    it('dedup 超過 1h 允許重發：_checkDedup 查無記錄 → 回傳 false', async () => {
      const chain = makeChain({ data: [], error: null })
      mockFrom.mockReturnValue(chain)

      const alreadySent = await service._checkDedup('quota_warning', 'key-1')
      expect(alreadySent).toBe(false)
    })

    it('_recordNotification 應寫入 notification_logs 表', async () => {
      const chain = makeChain({ data: { id: 'nl-1' }, error: null })
      mockFrom.mockReturnValue(chain)

      await service._recordNotification('quota_warning', 'key-1', 'user-1')
      expect(mockFrom).toHaveBeenCalledWith('notification_logs')
      expect(chain.insert).toHaveBeenCalledWith({
        event_type: 'quota_warning',
        key_id: 'key-1',
        user_id: 'user-1',
      })
    })
  })
})
