import { createHash, randomBytes } from 'crypto'
import { supabaseAdmin } from '../lib/supabase.js'

export interface ApiKeyRecord {
  id: string
  user_id: string
  name: string
  prefix: string
  status: string
  quota_tokens: number
  created_at: string
}

export interface CreateKeyResult {
  id: string
  key: string
  prefix: string
  name: string
  status: string
  quota_tokens: number
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
   */
  async createKey(userId: string, name: string): Promise<CreateKeyResult> {
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
   * listKeys: 回傳用戶所有 keys（含 prefix，不含 hash）
   */
  async listKeys(userId: string): Promise<ApiKeyRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, user_id, name, prefix, status, quota_tokens, created_at')
      .eq('user_id', userId)

    if (error || !data) {
      return []
    }

    // 明確排除 key_hash，確保不洩漏敏感資料
    return (data as Record<string, unknown>[]).map(
      ({ key_hash: _removed, ...rest }) => rest as unknown as ApiKeyRecord
    )
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
}
