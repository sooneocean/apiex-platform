import { createHmac } from 'crypto'
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

export interface QuotaWarningPayload {
  event: 'quota_warning'
  threshold: number
  key_id: string
  quota_tokens: number
  used_tokens: number
  usage_percent: number
  timestamp: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUOTA_THRESHOLDS = [80, 90, 100] as const
const DEDUP_WINDOW_HOURS = 24

// ─── WebhookService ───────────────────────────────────────────────────────────

export class WebhookService {
  /**
   * 取得用戶的 webhook 設定（每用戶一組）
   */
  async getConfig(userId: string): Promise<WebhookConfig | null> {
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
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid webhook URL')
      }
    } catch {
      throw new Error('Invalid webhook URL')
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

    return data as WebhookConfig
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
    const config = await this.getConfig(userId)
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
      const resp = await fetch(config.url, { method: 'POST', headers, body })
      statusCode = resp.status
      responseBody = await resp.text()
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
   * 檢查是否在過去 24h 內已發過同一 key + threshold 的通知
   * @internal 暴露給測試使用
   */
  async _hasRecentLog(
    userId: string,
    keyId: string,
    threshold: number
  ): Promise<boolean> {
    const config = await this.getConfig(userId)
    if (!config) return false

    const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString()

    const { data } = await supabaseAdmin
      .from('webhook_logs')
      .select('id')
      .eq('webhook_config_id', config.id)
      .eq('event', 'quota_warning')
      .gte('created_at', since)
      .limit(1)

    if (!data || data.length === 0) return false

    // 檢查 payload 中 key_id 和 threshold 是否吻合
    const { data: matchData } = await supabaseAdmin
      .from('webhook_logs')
      .select('id, payload')
      .eq('webhook_config_id', config.id)
      .eq('event', 'quota_warning')
      .gte('created_at', since)

    if (!matchData) return false

    return (matchData as Array<{ payload: Record<string, unknown> }>).some(
      (row) => row.payload?.key_id === keyId && row.payload?.threshold === threshold
    )
  }

  /**
   * 檢查配額閾值並觸發通知
   *
   * 計算邏輯：
   *   usedRatio = (quotaTokens - remaining) / quotaTokens × 100
   *   其中 remaining = quotaTokens - usedSinceStart
   *
   * 注意：currentUsed 是從 proxy 傳入的「本次請求 token 數」，
   * 但閾值判斷需要的是「總消耗比例」。
   * 由於 settleQuota 已更新 DB，這裡需要查詢 DB 中實際剩餘量。
   * 為簡化，本方法接受 currentUsed 作為「已消耗 token 數」。
   *
   * 觸發規則：選出 usedPercent 達到的「最高閾值」發送一次通知。
   * 防重複：同一 key + 同一 threshold 在 24h 內只發一次。
   */
  async checkAndNotifyQuota(
    userId: string,
    keyId: string,
    quotaTokens: number,
    currentUsed: number
  ): Promise<void> {
    // 無限配額或配額為 0 跳過
    if (quotaTokens <= 0) return

    const usedPercent = (currentUsed / quotaTokens) * 100

    // 找出達到的最高閾值（100 > 90 > 80）
    let triggeredThreshold: number | null = null
    for (const threshold of [...QUOTA_THRESHOLDS].reverse()) {
      if (usedPercent >= threshold) {
        triggeredThreshold = threshold
        break
      }
    }

    if (triggeredThreshold === null) return

    // 防重複：24h 內相同 key + threshold 已發過則跳過
    const alreadySent = await this._hasRecentLog(userId, keyId, triggeredThreshold)
    if (alreadySent) return

    const payload: QuotaWarningPayload = {
      event: 'quota_warning',
      threshold: triggeredThreshold,
      key_id: keyId,
      quota_tokens: quotaTokens,
      used_tokens: currentUsed,
      usage_percent: Math.round(usedPercent * 10) / 10,
      timestamp: new Date().toISOString(),
    }

    await this.sendNotification(userId, 'quota_warning', payload as unknown as Record<string, unknown>)
  }
}
