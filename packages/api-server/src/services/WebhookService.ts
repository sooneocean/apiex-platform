import { createHmac } from 'crypto'
import { lookup } from 'dns/promises'
import { supabaseAdmin } from '../lib/supabase.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebhookConfig {
  id: string
  user_id: string
  url: string
  secret: string | null
  events: string[]
  is_active: boolean
  created_at: string
}

export interface WebhookLog {
  id: string
  webhook_config_id: string
  event: string
  payload: Record<string, unknown>
  status_code: number | null
  response_body: string | null
  created_at: string
}

/**
 * Unified notification payload format for all 4 event types.
 * - quota_warning:       current_value = remaining tokens, threshold = original_quota * 0.2
 * - quota_exhausted:     current_value = 0, threshold = original quota
 * - spend_warning:       current_value = spent_usd (cents), threshold = spend_limit_usd * 0.8
 * - spend_limit_reached: current_value = spent_usd (cents), threshold = spend_limit_usd
 */
export interface NotificationPayload {
  event_type: string
  key_id: string
  key_prefix: string
  current_value: number
  threshold: number
  timestamp: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEDUP_WINDOW_HOURS = 1
const WEBHOOK_FETCH_TIMEOUT_MS = 10_000
const WEBHOOK_RESPONSE_MAX_BYTES = 1024

const VALID_EVENTS = ['quota_warning', 'quota_exhausted', 'spend_warning', 'spend_limit_reached'] as const

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length === 4) {
    if (parts[0] === 127) return true
    if (parts[0] === 10) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 0) return true
  }
  if (ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true
  return false
}

// ─── WebhookService ───────────────────────────────────────────────────────────

export class WebhookService {
  /**
   * 取得用戶的 webhook 設定（每用戶一組）
   */
  async getConfig(userId: string): Promise<WebhookConfig | null> {
    const { data, error } = await supabaseAdmin
      .from('webhook_configs')
      .select('id, user_id, url, events, is_active, created_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) return null
    return { ...data, secret: null } as WebhookConfig
  }

  private async _getConfigWithSecret(userId: string): Promise<WebhookConfig | null> {
    const { data, error } = await supabaseAdmin
      .from('webhook_configs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) return null
    return data as WebhookConfig
  }

  /**
   * 建立或更新 webhook 設定（upsert on user_id）
   */
  async upsertConfig(
    userId: string,
    url: string,
    secret?: string,
    events?: string[]
  ): Promise<WebhookConfig> {
    // 驗證 URL 格式
    let parsed: URL
    try {
      parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid webhook URL')
      }
    } catch {
      throw new Error('Invalid webhook URL')
    }

    // SSRF 防護
    await this._validateUrlSafety(parsed)

    // events 白名單驗證
    if (events) {
      if (events.length === 0) {
        throw new Error('events must not be empty')
      }
      const invalid = events.filter(e => !(VALID_EVENTS as readonly string[]).includes(e))
      if (invalid.length > 0) {
        throw new Error(`Invalid event types: ${invalid.join(', ')}`)
      }
    }

    const { data, error } = await supabaseAdmin
      .from('webhook_configs')
      .upsert(
        {
          user_id: userId,
          url,
          secret: secret ?? null,
          events: events ?? ['quota_warning'],
          is_active: true,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to upsert webhook config: ${error?.message ?? 'Unknown'}`)
    }

    const { secret: _secret, ...safeData } = data as WebhookConfig
    return { ...safeData, secret: null } as WebhookConfig
  }

  /**
   * SSRF 防護：拒絕私有 IP 和 localhost
   * @internal 暴露給測試使用
   */
  async _validateUrlSafety(parsed: URL): Promise<void> {
    const hostname = parsed.hostname.toLowerCase()
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      throw new Error('Invalid webhook URL: private hostnames are not allowed')
    }
    try {
      const { address } = await lookup(hostname)
      if (isPrivateIP(address)) {
        throw new Error('Invalid webhook URL: private IP addresses are not allowed')
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('private')) throw err
      throw new Error('Invalid webhook URL: hostname could not be resolved')
    }
  }

  /**
   * 刪除指定 webhook 設定
   */
  async deleteConfig(userId: string, configId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('webhook_configs')
      .delete()
      .eq('id', configId)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`Failed to delete webhook config: ${error.message}`)
    }
  }

  /**
   * 列出 webhook 推播記錄
   */
  async listLogs(configId: string, limit = 50): Promise<WebhookLog[]> {
    const { data, error } = await supabaseAdmin
      .from('webhook_logs')
      .select('*')
      .eq('webhook_config_id', configId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []
    return data as WebhookLog[]
  }

  /**
   * 發送 webhook 通知
   * - 查詢設定 → 若無設定或 is_active=false，靜默返回 null
   * - POST JSON + 可選 HMAC-SHA256 簽名
   * - 記錄推播結果到 webhook_logs（含失敗）
   * - 永遠不拋出（fire-and-forget 安全）
   */
  async sendNotification(
    userId: string,
    event: string,
    payload: Record<string, unknown>
  ): Promise<WebhookLog | null> {
    const config = await this._getConfigWithSecret(userId)
    if (!config || !config.is_active) return null
    if (!config.events.includes(event)) return null

    const body = JSON.stringify({ ...payload, event })
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Apiex-Webhook/1.0',
    }

    // HMAC-SHA256 簽名
    if (config.secret) {
      const sig = createHmac('sha256', config.secret).update(body).digest('hex')
      headers['X-Webhook-Signature'] = `sha256=${sig}`
    }

    let statusCode: number | null = null
    let responseBody: string | null = null

    try {
      const resp = await fetch(config.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(WEBHOOK_FETCH_TIMEOUT_MS),
      })
      statusCode = resp.status
      const text = await resp.text()
      responseBody = text.slice(0, WEBHOOK_RESPONSE_MAX_BYTES)
    } catch (err) {
      responseBody = err instanceof Error ? err.message : 'Unknown error'
    }

    // 記錄 log（失敗也記）
    const { data: logData } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        webhook_config_id: config.id,
        event,
        payload,
        status_code: statusCode,
        response_body: responseBody,
      })
      .select()
      .single()

    return (logData as WebhookLog | null) ?? {
      id: '',
      webhook_config_id: config.id,
      event,
      payload,
      status_code: statusCode,
      response_body: responseBody,
      created_at: new Date().toISOString(),
    }
  }

  /**
   * 查詢過去 1h 內是否有同 event_type + key_id 的 dedup 記錄
   * @internal 暴露給測試使用
   */
  async _checkDedup(eventType: string, keyId: string): Promise<boolean> {
    const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString()

    const { data } = await supabaseAdmin
      .from('notification_logs')
      .select('id')
      .eq('event_type', eventType)
      .eq('key_id', keyId)
      .gte('created_at', since)
      .limit(1)

    return Array.isArray(data) && data.length > 0
  }

  /**
   * 寫入 notification_logs，記錄本次通知（dedup 用）
   * @internal 暴露給測試使用
   */
  async _recordNotification(eventType: string, keyId: string, userId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('notification_logs')
      .insert({ event_type: eventType, key_id: keyId, user_id: userId })

    if (error) {
      console.error('[WebhookService] Failed to record notification_logs:', error)
    }
  }

  /**
   * 檢查配額並觸發通知
   *
   * 查詢 DB 中 api_keys.quota_tokens（當前剩餘量）及
   * user_quotas.default_quota_tokens（原始配額，用來計算 20% 門檻）：
   * - quota_tokens = -1（無限制）→ 跳過
   * - 剩餘 = 0 → quota_exhausted
   * - 剩餘 < original_quota * 0.2（< 20%）→ quota_warning
   * - 1h 內相同 event + key 已通知 → dedup 跳過
   */
  async checkAndNotifyQuota(userId: string, keyId: string): Promise<void> {
    // 查詢 api_keys：當前剩餘量 + prefix + user_id
    const { data: keyData } = await supabaseAdmin
      .from('api_keys')
      .select('quota_tokens, prefix, user_id')
      .eq('id', keyId)
      .single()

    if (!keyData) return

    const { quota_tokens: remaining, prefix, user_id: keyUserId } = keyData as {
      quota_tokens: number
      prefix: string
      user_id: string
    }

    // -1 = 無限制，跳過
    if (remaining === -1) return

    // 查詢原始配額（user_quotas.default_quota_tokens）
    const { data: quotaData } = await supabaseAdmin
      .from('user_quotas')
      .select('default_quota_tokens')
      .eq('user_id', keyUserId)
      .single()

    const originalQuota = (quotaData as { default_quota_tokens: number } | null)?.default_quota_tokens ?? 0

    // 原始配額 <= 0 跳過
    if (originalQuota <= 0) return

    // 判斷事件類型
    let eventType: string
    let currentValue: number
    let threshold: number

    const warningThreshold = Math.floor(originalQuota * 0.2)

    if (remaining === 0) {
      eventType = 'quota_exhausted'
      currentValue = 0
      threshold = originalQuota
    } else if (remaining < warningThreshold) {
      eventType = 'quota_warning'
      currentValue = remaining
      threshold = warningThreshold
    } else {
      // 剩餘 >= 20%，不觸發
      return
    }

    // dedup 檢查
    const alreadySent = await this._checkDedup(eventType, keyId)
    if (alreadySent) return

    const payload: NotificationPayload = {
      event_type: eventType,
      key_id: keyId,
      key_prefix: prefix ?? '',
      current_value: currentValue,
      threshold: threshold,
      timestamp: new Date().toISOString(),
    }

    await this.sendNotification(userId, eventType, payload as unknown as Record<string, unknown>)
    await this._recordNotification(eventType, keyId, userId)
  }

  /**
   * 檢查花費並觸發通知
   *
   * 查詢 DB 中 api_keys 的 spent_usd 和 spend_limit_usd：
   * - spend_limit_usd = -1（無限）→ 跳過
   * - spent = 0 → 跳過（無任何花費）
   * - spent >= spend_limit → spend_limit_reached
   * - spent > spend_limit * 0.8（> 80%）→ spend_warning
   * - 1h 內相同 event + key 已通知 → dedup 跳過
   */
  async checkAndNotifySpend(userId: string, keyId: string): Promise<void> {
    const { data: keyData } = await supabaseAdmin
      .from('api_keys')
      .select('spent_usd, spend_limit_usd, prefix')
      .eq('id', keyId)
      .single()

    if (!keyData) return

    const { spent_usd: spentUsd, spend_limit_usd: spendLimit, prefix } = keyData as {
      spent_usd: number
      spend_limit_usd: number
      prefix: string
    }

    // 無限花費（-1）跳過
    if (spendLimit === -1) return

    // spent = 0 跳過（沒有任何花費）
    if (spentUsd === 0) return

    let eventType: string
    let currentValue: number
    let threshold: number

    if (spentUsd >= spendLimit) {
      eventType = 'spend_limit_reached'
      currentValue = spentUsd
      threshold = spendLimit
    } else if (spentUsd > Math.floor(spendLimit * 0.8)) {
      eventType = 'spend_warning'
      currentValue = spentUsd
      threshold = Math.floor(spendLimit * 0.8)
    } else {
      return
    }

    // dedup 檢查
    const alreadySent = await this._checkDedup(eventType, keyId)
    if (alreadySent) return

    const payload: NotificationPayload = {
      event_type: eventType,
      key_id: keyId,
      key_prefix: prefix ?? '',
      current_value: currentValue,
      threshold: threshold,
      timestamp: new Date().toISOString(),
    }

    await this.sendNotification(userId, eventType, payload as unknown as Record<string, unknown>)
    await this._recordNotification(eventType, keyId, userId)
  }
}
