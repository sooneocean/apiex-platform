import { createHash, randomBytes } from 'crypto'
import { supabaseAdmin } from '../lib/supabase.js'

export interface ApiKeyRecord {
  id: string
  user_id: string
  name: string
  prefix: string
  status: string
  quota_tokens: number
  spend_limit_usd: number
  spent_usd: number
  created_at: string
}

export interface CreateKeyResult {
  id: string
  key: string
  prefix: string
  name: string
  status: string
  quota_tokens: number
  spend_limit_usd: number
  spent_usd: number
  created_at: string
}

export interface ReserveQuotaResult {
  success: boolean
  remainingTokens?: number
}

export class KeyService {
  /**
   * createKey: 產生 API key，sha256 hash 存 DB，回傳明文（一次性）
   * Key 格式：apx-sk-{base64url(32bytes)}
   * prefix 取前 8 字元
   * quota_tokens 繼承 user_quotas.default_quota_tokens，無記錄則為 -1
   * spend_limit_usd: 可選，預設 -1（無限制）
   */
  async createKey(userId: string, name: string, spendLimitUsd = -1): Promise<CreateKeyResult> {
    // 1. 查詢用戶預設 quota
    const { data: quotaRecord } = await supabaseAdmin
      .from('user_quotas')
      .select('default_quota_tokens')
      .eq('user_id', userId)
      .single()

    const quotaTokens: number =
      quotaRecord?.default_quota_tokens !== undefined ? quotaRecord.default_quota_tokens : -1

    // 2. 產生 key
    const rawBytes = randomBytes(32)
    const base64url = rawBytes
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    const plainKey = `apx-sk-${base64url}`
    const prefix = plainKey.slice(0, 8)

    // 3. sha256 hash
    const keyHash = createHash('sha256').update(plainKey).digest('hex')

    // 4. 寫入 DB
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .insert({
        user_id: userId,
        name,
        key_hash: keyHash,
        prefix,
        status: 'active',
        quota_tokens: quotaTokens,
        spend_limit_usd: spendLimitUsd,
        spent_usd: 0,
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to create API key: ${error?.message ?? 'Unknown error'}`)
    }

    return {
      id: data.id,
      key: plainKey,
      prefix,
      name: data.name,
      status: data.status,
      quota_tokens: data.quota_tokens,
      spend_limit_usd: data.spend_limit_usd ?? -1,
      spent_usd: data.spent_usd ?? 0,
      created_at: data.created_at,
    }
  }

  /**
   * validateKey: 查 DB 回傳 key record 或 null（只查 status='active'）
   */
  async validateKey(keyHash: string): Promise<ApiKeyRecord | null> {
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .eq('key_hash', keyHash)
      .eq('status', 'active')
      .single()

    if (error || !data) {
      return null
    }

    return data as ApiKeyRecord
  }

  /**
   * revokeKey: 更新 status='revoked' + revoked_at
   */
  async revokeKey(userId: string, keyId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('api_keys')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
      })
      .eq('id', keyId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to revoke API key: ${error.message}`)
    }
  }

  /**
   * reserveQuota: atomic SQL 預扣估算額度
   * SQL: UPDATE api_keys SET quota_tokens = quota_tokens - $estimated
   *      WHERE id = $id AND (quota_tokens >= $estimated OR quota_tokens = -1)
   *      RETURNING quota_tokens
   */
  async reserveQuota(keyId: string, estimatedTokens: number): Promise<ReserveQuotaResult> {
    const { data, error } = await supabaseAdmin.rpc('reserve_quota', {
      p_key_id: keyId,
      p_estimated: estimatedTokens,
    })

    if (error) {
      throw new Error(`Failed to reserve quota: ${error.message}`)
    }

    if (data === null || data === undefined) {
      // No rows updated → insufficient quota
      return { success: false }
    }

    return { success: true, remainingTokens: data as number }
  }

  /**
   * settleQuota: 結算差額
   * diff = reservedTokens - actualTokens（正數代表退回，負數代表補扣）
   * quota_tokens = -1 的 key 透過 SQL WHERE quota_tokens != -1 自動跳過
   * SQL: UPDATE api_keys SET quota_tokens = quota_tokens + $diff
   *      WHERE id = $id AND quota_tokens != -1
   */
  async settleQuota(keyId: string, reservedTokens: number, actualTokens: number): Promise<void> {
    const diff = reservedTokens - actualTokens

    const { error } = await supabaseAdmin.rpc('settle_quota', {
      p_key_id: keyId,
      p_diff: diff,
    })

    if (error) {
      throw new Error(`Failed to settle quota: ${error.message}`)
    }
  }

  /**
   * checkSpendLimit: 呼叫 check_spend_limit RPC，確認 key 的花費是否在上限內
   * 回傳 true = 仍在限制內（可繼續請求）；false = 超限（應拒絕）
   */
  async checkSpendLimit(keyId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc('check_spend_limit', {
      p_key_id: keyId,
    })

    if (error) {
      throw new Error(`Failed to check spend limit: ${error.message}`)
    }

    // data === null 表示查無此 key，保守處理為拒絕
    if (data === null || data === undefined) {
      return false
    }

    return data as boolean
  }

  /**
   * recordSpend: 呼叫 record_spend RPC，累加本次花費（美分）
   * fire-and-forget 用途，呼叫端不需 await
   */
  async recordSpend(keyId: string, amountCents: number): Promise<void> {
    if (amountCents <= 0) return

    const { error } = await supabaseAdmin.rpc('record_spend', {
      p_key_id: keyId,
      p_amount_cents: amountCents,
    })

    if (error) {
      throw new Error(`Failed to record spend: ${error.message}`)
    }
  }

  /**
   * updateSpendLimit: 更新 key 的花費上限
   * spendLimitUsd: -1 = 無限制；0 = 完全禁止；正整數 = 美分上限
   */
  async updateSpendLimit(userId: string, keyId: string, spendLimitUsd: number): Promise<void> {
    const { error } = await supabaseAdmin
      .from('api_keys')
      .update({ spend_limit_usd: spendLimitUsd })
      .eq('id', keyId)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`Failed to update spend limit: ${error.message}`)
    }
  }

  /**
   * listKeys: 回傳用戶所有 keys，包含 spend_limit_usd 和 spent_usd
   * （覆寫父類以選取新欄位）
   */
  async listKeys(userId: string): Promise<ApiKeyRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, user_id, name, prefix, status, quota_tokens, spend_limit_usd, spent_usd, created_at')
      .eq('user_id', userId)

    if (error || !data) {
      return []
    }

    // 明確排除 key_hash，確保不洩漏敏感資料
    return (data as Record<string, unknown>[]).map(
      ({ key_hash: _removed, ...rest }) => rest as unknown as ApiKeyRecord
    )
  }
}
