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
    };
  };
}
