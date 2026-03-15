const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  key_count: number;
  total_tokens_used: number;
  quota_tokens: number;
  rate_limit_tier: string;
  created_at: string;
}

export interface UsageLog {
  id: string;
  api_key_prefix: string;
  model_tag: string;
  upstream_model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  key_prefix: string;
  key?: string;
  name: string;
  status: string;
  quota_tokens: number;
  spend_limit_usd: number;
  spent_usd: number;
  created_at: string;
  expires_at: string | null;
}

export interface UsageLogsQuery {
  model_tag?: string;
  page?: number;
  per_page?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface AdminUsersResponse {
  data: AdminUser[];
  pagination: Pagination;
}

export interface PaginatedLogs {
  data: UsageLog[];
  pagination: Pagination;
}

export interface ApiKeysResponse {
  data: ApiKey[];
}

export interface CreateKeyData extends ApiKey {
  key: string;
}

export interface CreateKeyResponse {
  data: CreateKeyData;
  warning: string;
}

export interface TopupLog {
  id: string;
  amount_usd: number;
  tokens_granted: number;
  status: string;
  created_at: string;
}

export interface AdminTopupLog extends TopupLog {
  user_id: string;
  user_email?: string;
  stripe_session_id: string;
}

export interface CheckoutResponse {
  data: {
    checkout_url: string;
    session_id: string;
  };
}

export interface TopupStatusResponse {
  data: {
    status: 'pending' | 'completed';
    tokens_granted: number | null;
    completed_at: string | null;
  };
}

export interface TopupLogsResponse {
  data: TopupLog[];
  pagination: Pagination;
}

// ─── Base fetch helpers ───────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error?.message || message;
    } catch {
      // ignore parse errors
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(
  path: string,
  token: string,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  return handleResponse<T>(res);
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  token: string,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  token: string,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse<T>(res);
}

// ─── Domain-level API clients ─────────────────────────────────────────────────

export function makeAdminApi(token: string) {
  return {
    getUsers: () => apiGet<AdminUsersResponse>("/admin/users", token),
    setQuota: (userId: string, quotaTokens: number) =>
      apiPatch<AdminUser>(`/admin/users/${userId}/quota`, { quota_tokens: quotaTokens }, token),
    setRateLimit: (userId: string, tier: string) =>
      apiPatch<{ data: { user_id: string; updated_keys: number; tier: string } }>(
        `/admin/users/${userId}/rate-limit`,
        { tier },
        token
      ),
    getUsageLogs: (query: UsageLogsQuery = {}, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (query.model_tag) params.set("model_tag", query.model_tag);
      if (query.page !== undefined) params.set("page", String(query.page));
      if (query.per_page !== undefined) params.set("limit", String(query.per_page));
      const qs = params.toString();
      return apiGet<PaginatedLogs>(`/admin/usage-logs${qs ? `?${qs}` : ""}`, token, signal);
    },
    getTopupLogs: (query: { page?: number; limit?: number; user_id?: string } = {}) => {
      const params = new URLSearchParams();
      if (query.page !== undefined) params.set("page", String(query.page));
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      if (query.user_id) params.set("user_id", query.user_id);
      const qs = params.toString();
      return apiGet<{ data: AdminTopupLog[]; pagination: Pagination }>(`/admin/topup-logs${qs ? `?${qs}` : ""}`, token);
    },
  };
}

export function makeTopupApi(token: string) {
  return {
    checkout: (planId: string) =>
      apiPost<CheckoutResponse>('/topup/checkout', { plan_id: planId }, token),
    getStatus: (sessionId: string) =>
      apiGet<TopupStatusResponse>(`/topup/status?session_id=${sessionId}`, token),
    getLogs: (page = 1, limit = 20) =>
      apiGet<TopupLogsResponse>(`/topup/logs?page=${page}&limit=${limit}`, token),
  };
}

export function makeKeysApi(token: string) {
  return {
    list: () => apiGet<ApiKeysResponse>("/keys", token),
    create: (name: string, spendLimitUsd?: number, expiresAt?: string) =>
      apiPost<CreateKeyResponse>("/keys", {
        name,
        ...(spendLimitUsd !== undefined ? { spend_limit_usd: spendLimitUsd } : {}),
        ...(expiresAt ? { expires_at: expiresAt } : {}),
      }, token),
    revoke: (id: string) => apiDelete<{ success: boolean }>(`/keys/${id}`, token),
    updateSpendLimit: (id: string, spendLimitUsd: number) =>
      apiPatch<{ data: { id: string; spend_limit_usd: number } }>(`/keys/${id}`, { spend_limit_usd: spendLimitUsd }, token),
    resetSpend: (id: string) =>
      apiPost<{ data: { id: string; spent_usd: number; spend_limit_usd: number; message: string } }>(`/keys/${id}/reset-spend`, {}, token),
  };
}

// ─── Analytics Types ──────────────────────────────────────────────────────────

export interface AuthMeResponse {
  data: {
    id: string;
    email: string;
    isAdmin: boolean;
  };
}

/** 單一 model 在某時間點的 token 數據 */
export interface ModelTokenData {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** 時序資料點（每個 key 是 model_tag，值為 ModelTokenData） */
export type TimeseriesPoint = {
  timestamp: string;
  [modelTag: string]: ModelTokenData | string;
};

export interface TimeseriesData {
  period: string;
  granularity: "hour" | "day";
  series: TimeseriesPoint[];
  totals: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    total_requests: number;
  };
}

export interface ModelBreakdownItem {
  model_tag: string;
  total_tokens: number;
  total_requests: number;
  percentage: number;
}

export interface ModelBreakdownData {
  period: string;
  breakdown: ModelBreakdownItem[];
}

/** 單一 model 在某時間點的延遲百分位 */
export interface ModelLatencyData {
  p50: number;
  p95: number;
  p99: number;
}

/** 延遲時序資料點 */
export type LatencyPoint = {
  timestamp: string;
  [modelTag: string]: ModelLatencyData | string;
};

export interface LatencyData {
  period: string;
  granularity: "hour" | "day";
  series: LatencyPoint[];
}

export interface BillingBreakdownItem {
  model_tag: string;
  prompt_tokens: number;
  completion_tokens: number;
  input_cost_usd: number;
  output_cost_usd: number;
  total_cost_usd: number;
  rate: {
    input_rate_per_1k: number;
    output_rate_per_1k: number;
  };
}

export interface BillingSummary {
  period: string;
  cost: {
    total_usd: number;
    breakdown: BillingBreakdownItem[];
  } | null;
  quota: {
    total_quota_tokens: number;
    is_unlimited: boolean;
    estimated_days_remaining: number | null;
    daily_avg_consumption: number;
  };
  recent_topups: {
    id: string;
    amount_usd: number;
    tokens_granted: number;
    created_at: string;
  }[];
}

export interface PlatformOverviewData {
  period: string;
  total_tokens: number;
  total_requests: number;
  active_users: number;
  avg_latency_ms: number;
  series: TimeseriesPoint[];
}

export interface UserRanking {
  user_id: string;
  email: string;
  total_tokens: number;
  total_requests: number;
  total_cost_usd: number | null;
}

export interface TopUsersData {
  period: string;
  rankings: UserRanking[];
}

export interface ModelRate {
  id: string;
  model_tag: string;
  input_rate_per_1k: number;
  output_rate_per_1k: number;
  effective_from: string;
  created_at: string;
}

export interface ModelRateInsert {
  model_tag: string;
  input_rate_per_1k: number;
  output_rate_per_1k: number;
  effective_from?: string;
}

export type Period = "24h" | "7d" | "30d";

// ─── Analytics API Factories ──────────────────────────────────────────────────

export async function authMe(token: string): Promise<AuthMeResponse> {
  return apiGet<AuthMeResponse>("/auth/me", token);
}

export function makeAnalyticsApi(token: string) {
  return {
    getTimeseries: (params: { period?: Period; key_id?: string }, signal?: AbortSignal) => {
      const qs = new URLSearchParams();
      if (params.period) qs.set("period", params.period);
      if (params.key_id) qs.set("key_id", params.key_id);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiGet<{ data: TimeseriesData }>(`/analytics/timeseries${query}`, token, signal);
    },
    getModelBreakdown: (params: { period?: Period; key_id?: string }, signal?: AbortSignal) => {
      const qs = new URLSearchParams();
      if (params.period) qs.set("period", params.period);
      if (params.key_id) qs.set("key_id", params.key_id);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiGet<{ data: ModelBreakdownData }>(`/analytics/model-breakdown${query}`, token, signal);
    },
    getLatency: (params: { period?: Period; key_id?: string }, signal?: AbortSignal) => {
      const qs = new URLSearchParams();
      if (params.period) qs.set("period", params.period);
      if (params.key_id) qs.set("key_id", params.key_id);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiGet<{ data: LatencyData }>(`/analytics/latency${query}`, token, signal);
    },
    getBilling: (params: { period?: Period }, signal?: AbortSignal) => {
      const qs = new URLSearchParams();
      if (params.period) qs.set("period", params.period);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiGet<{ data: BillingSummary }>(`/analytics/billing${query}`, token, signal);
    },
  };
}

export function makeAdminAnalyticsApi(token: string) {
  return {
    getOverview: (params: { period?: Period }, signal?: AbortSignal) => {
      const qs = new URLSearchParams();
      if (params.period) qs.set("period", params.period);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiGet<{ data: PlatformOverviewData }>(`/admin/analytics/overview${query}`, token, signal);
    },
    getTimeseries: (params: { period?: Period }, signal?: AbortSignal) => {
      const qs = new URLSearchParams();
      if (params.period) qs.set("period", params.period);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiGet<{ data: TimeseriesData }>(`/admin/analytics/timeseries${query}`, token, signal);
    },
    getLatency: (params: { period?: Period }, signal?: AbortSignal) => {
      const qs = new URLSearchParams();
      if (params.period) qs.set("period", params.period);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiGet<{ data: LatencyData }>(`/admin/analytics/latency${query}`, token, signal);
    },
    getTopUsers: (params: { period?: Period; limit?: number }, signal?: AbortSignal) => {
      const qs = new URLSearchParams();
      if (params.period) qs.set("period", params.period);
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiGet<{ data: TopUsersData }>(`/admin/analytics/top-users${query}`, token, signal);
    },
  };
}

export function makeRatesApi(token: string) {
  return {
    list: (signal?: AbortSignal) =>
      apiGet<{ data: ModelRate[] }>("/admin/rates", token, signal),
    create: (data: ModelRateInsert, signal?: AbortSignal) =>
      apiPost<{ data: ModelRate }>("/admin/rates", data, token, signal),
    update: (id: string, data: Partial<ModelRateInsert>, signal?: AbortSignal) =>
      apiPatch<{ data: ModelRate }>(`/admin/rates/${id}`, data, token, signal),
  };
}

// ─── Route Config (Models) Types ──────────────────────────────────────────────

export interface RouteConfig {
  id: string;
  tag: string;
  upstream_provider: string;
  upstream_model: string;
  upstream_base_url: string;
  is_active: boolean;
  updated_at: string;
}

export interface RouteConfigCreate {
  tag: string;
  upstream_provider: string;
  upstream_model: string;
  upstream_base_url: string;
  is_active?: boolean;
}

// ─── Models API Factory ───────────────────────────────────────────────────────

export function makeModelsApi(token: string) {
  return {
    list: (signal?: AbortSignal) =>
      apiGet<{ data: RouteConfig[] }>("/admin/models", token, signal),
    create: (data: RouteConfigCreate, signal?: AbortSignal) =>
      apiPost<{ data: RouteConfig }>("/admin/models", data, token, signal),
    update: (id: string, data: Partial<RouteConfigCreate>, signal?: AbortSignal) =>
      apiPatch<{ data: RouteConfig }>(`/admin/models/${id}`, data, token, signal),
  };
}

// ─── Routes API Factory (FA-E) ────────────────────────────────────────────────

export interface RouteToggleResponse {
  data: RouteConfig;
  warning?: "last_active_route";
}

// ─── Webhook Types ────────────────────────────────────────────────────────────

export type NotificationEventType =
  | 'quota_warning'
  | 'quota_exhausted'
  | 'spend_warning'
  | 'spend_limit_reached'

export const NOTIFICATION_EVENTS: { value: NotificationEventType; label: string }[] = [
  { value: 'quota_warning', label: '配額警告（< 20%）' },
  { value: 'quota_exhausted', label: '配額耗盡（= 0）' },
  { value: 'spend_warning', label: '花費警告（> 80%）' },
  { value: 'spend_limit_reached', label: '花費達限（>= 100%）' },
]

export interface WebhookConfig {
  id: string
  user_id: string
  url: string
  secret?: string | null
  events: NotificationEventType[]
  is_active: boolean
  created_at: string
}

export interface WebhookLog {
  id: string
  webhook_config_id: string
  event: string
  payload: {
    event_type: string
    key_id: string
    key_prefix: string
    current_value: number
    threshold: number
    timestamp: string
    is_test?: boolean
  }
  status_code: number | null
  response_body: string | null
  created_at: string
}

export interface WebhookConfigResponse {
  data: WebhookConfig | null
}

export interface WebhookLogsResponse {
  data: WebhookLog[]
}

export interface AdminWebhooksResponse {
  data: WebhookConfig[]
  pagination: Pagination
}

// ─── Webhook API Factories ────────────────────────────────────────────────────

export function makeWebhooksApi(token: string) {
  return {
    get: () =>
      apiGet<WebhookConfigResponse>('/webhooks', token),
    upsert: (data: { url: string; secret?: string; events?: string[]; is_active?: boolean }) =>
      apiPost<WebhookConfigResponse>('/webhooks', data, token),
    remove: (id: string) =>
      apiDelete<{ data: { id: string; deleted: boolean } }>(`/webhooks/${id}`, token),
    logs: (id: string, limit = 20) =>
      apiGet<WebhookLogsResponse>(`/webhooks/${id}/logs?limit=${limit}`, token),
    test: () =>
      apiPost<{ data: WebhookLog }>('/webhooks/test', {}, token),
  }
}

export function makeAdminWebhooksApi(token: string) {
  return {
    list: (query: { page?: number; limit?: number } = {}) => {
      const params = new URLSearchParams()
      if (query.page !== undefined) params.set('page', String(query.page))
      if (query.limit !== undefined) params.set('limit', String(query.limit))
      const qs = params.toString()
      return apiGet<AdminWebhooksResponse>(`/admin/webhooks${qs ? `?${qs}` : ''}`, token)
    },
  }
}

// ─── Rate Limit Types ─────────────────────────────────────────────────────────

export interface RateLimitTier {
  tier: string
  rpm: number
  tpm: number
  created_at: string
}

export interface ModelRateOverride {
  id: string
  tier: string
  model_tag: string
  rpm: number
  tpm: number
  created_at: string
}

// ─── Rate Limit API Factories ─────────────────────────────────────────────────

export function makeRateLimitsApi(token: string) {
  return {
    // Tier CRUD
    listTiers: () =>
      apiGet<{ data: RateLimitTier[] }>('/admin/rate-limits/tiers', token),
    createTier: (data: { tier: string; rpm: number; tpm: number }) =>
      apiPost<{ data: RateLimitTier }>('/admin/rate-limits/tiers', data, token),
    updateTier: (tier: string, data: { rpm?: number; tpm?: number }) =>
      apiPatch<{ data: RateLimitTier }>(`/admin/rate-limits/tiers/${tier}`, data, token),
    deleteTier: (tier: string) =>
      apiDelete<{ data: { tier: string; deleted: boolean } }>(`/admin/rate-limits/tiers/${tier}`, token),

    // Model Override CRUD
    listOverrides: (tier?: string) => {
      const qs = tier ? `?tier=${encodeURIComponent(tier)}` : ''
      return apiGet<{ data: ModelRateOverride[] }>(`/admin/rate-limits/overrides${qs}`, token)
    },
    createOverride: (data: { tier: string; model_tag: string; rpm: number; tpm: number }) =>
      apiPost<{ data: ModelRateOverride }>('/admin/rate-limits/overrides', data, token),
    updateOverride: (id: string, data: { rpm?: number; tpm?: number }) =>
      apiPatch<{ data: ModelRateOverride }>(`/admin/rate-limits/overrides/${id}`, data, token),
    deleteOverride: (id: string) =>
      apiDelete<{ data: { id: string; deleted: boolean } }>(`/admin/rate-limits/overrides/${id}`, token),
  }
}

export function makeRoutesApi(getToken: () => Promise<string>) {
  return {
    list: async (signal?: AbortSignal) => {
      const token = await getToken();
      return apiGet<{ data: RouteConfig[] }>("/admin/routes", token, signal);
    },
    create: async (data: RouteConfigCreate, signal?: AbortSignal) => {
      const token = await getToken();
      return apiPost<{ data: RouteConfig }>("/admin/routes", data, token, signal);
    },
    update: async (id: string, data: Partial<RouteConfigCreate>, signal?: AbortSignal) => {
      const token = await getToken();
      return apiPatch<{ data: RouteConfig }>(`/admin/routes/${id}`, data, token, signal);
    },
    toggle: async (id: string, signal?: AbortSignal) => {
      const token = await getToken();
      return apiPatch<RouteToggleResponse>(`/admin/routes/${id}/toggle`, {}, token, signal);
    },
  };
}
