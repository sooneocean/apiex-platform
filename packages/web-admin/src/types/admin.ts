export interface AdminUser {
  id: string
  email: string
  key_count: number
  total_tokens_used: number
  quota_tokens: number
  created_at: string
}

export interface UsageLog {
  id: string
  api_key_prefix: string
  model_tag: 'apex-smart' | 'apex-cheap'
  upstream_model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number
  status: 'success' | 'incomplete' | 'error'
  created_at: string
}

export interface ApiKey {
  id: string
  key_prefix: string
  key?: string // only present at creation
  name: string
  status: 'active' | 'revoked'
  quota_tokens: number
  created_at: string
}

export interface Pagination {
  page: number
  limit: number
  total: number
}

export interface AdminUsersResponse {
  data: AdminUser[]
  pagination: Pagination
}

export interface UsageLogsResponse {
  data: UsageLog[]
  pagination: Pagination
}

export interface ApiKeysResponse {
  data: ApiKey[]
}

export interface CreateKeyResponse {
  data: ApiKey & { key: string }
  warning: string
}

export interface SetQuotaResponse {
  data: {
    user_id: string
    updated_keys: number
    quota_tokens: number
  }
}
