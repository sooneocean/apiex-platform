/**
 * Apiex Platform - Database Type Definitions
 *
 * 手動定義，與 SQL migration schema 一對一對應。
 * 若 schema 變更，此檔案必須同步更新。
 */

// ---------------------------------------------------------------------------
// Enum-like union types
// ---------------------------------------------------------------------------

export type ApiKeyStatus = "active" | "revoked";
export type UsageLogStatus = "success" | "incomplete" | "error";

// ---------------------------------------------------------------------------
// Table row types
// ---------------------------------------------------------------------------

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  status: ApiKeyStatus;
  quota_tokens: number;
  created_at: string;
  revoked_at: string | null;
}

export interface UserQuota {
  user_id: string;
  default_quota_tokens: number;
  updated_at: string;
  updated_by: string | null;
}

export interface UsageLog {
  id: string;
  api_key_id: string;
  model_tag: string;
  upstream_model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status: UsageLogStatus;
  created_at: string;
}

export interface RouteConfig {
  id: string;
  tag: string;
  upstream_provider: string;
  upstream_model: string;
  upstream_base_url: string;
  is_active: boolean;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Insert types (omit server-generated fields)
// ---------------------------------------------------------------------------

export interface ApiKeyInsert {
  id?: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name?: string;
  status?: ApiKeyStatus;
  quota_tokens?: number;
  created_at?: string;
  revoked_at?: string | null;
}

export interface UserQuotaInsert {
  user_id: string;
  default_quota_tokens?: number;
  updated_at?: string;
  updated_by?: string | null;
}

export interface UsageLogInsert {
  id?: string;
  api_key_id: string;
  model_tag: string;
  upstream_model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  latency_ms?: number;
  status?: UsageLogStatus;
  created_at?: string;
}

export interface RouteConfigInsert {
  id?: string;
  tag: string;
  upstream_provider: string;
  upstream_model: string;
  upstream_base_url: string;
  is_active?: boolean;
  updated_at?: string;
}

export interface TopupLog {
  id: string
  user_id: string
  stripe_session_id: string
  stripe_event_id: string
  amount_usd: number
  tokens_granted: number
  status: 'completed'
  created_at: string
}

export interface ModelRate {
  id: string
  model_tag: string
  input_rate_per_1k: number
  output_rate_per_1k: number
  effective_from: string
  created_by: string | null  // 建立此費率的 Admin user ID（REFERENCES auth.users.id）
  created_at: string
}

export interface ModelRateInsert {
  model_tag: string
  input_rate_per_1k: number
  output_rate_per_1k: number
  effective_from?: string
  created_by?: string  // Admin user ID（用於追蹤費率建立者，由 RatesService 插入時填入）
}

export type ModelRateUpdate = Partial<ModelRateInsert>

export interface TopupLogInsert {
  user_id: string
  stripe_session_id: string
  stripe_event_id: string
  amount_usd: number
  tokens_granted: number
}

// ---------------------------------------------------------------------------
// Update types (all fields optional)
// ---------------------------------------------------------------------------

export type ApiKeyUpdate = Partial<ApiKeyInsert>;
export type UserQuotaUpdate = Partial<UserQuotaInsert>;
export type UsageLogUpdate = Partial<UsageLogInsert>;
export type RouteConfigUpdate = Partial<RouteConfigInsert>;

// ---------------------------------------------------------------------------
// Supabase-style Database interface
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      api_keys: {
        Row: ApiKey;
        Insert: ApiKeyInsert;
        Update: ApiKeyUpdate;
      };
      user_quotas: {
        Row: UserQuota;
        Insert: UserQuotaInsert;
        Update: UserQuotaUpdate;
      };
      usage_logs: {
        Row: UsageLog;
        Insert: UsageLogInsert;
        Update: UsageLogUpdate;
      };
      route_config: {
        Row: RouteConfig;
        Insert: RouteConfigInsert;
        Update: RouteConfigUpdate;
      };
      model_rates: {
        Row: ModelRate;
        Insert: ModelRateInsert;
        Update: ModelRateUpdate;
      };
    };
  };
}
