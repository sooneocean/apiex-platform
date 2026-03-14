const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  key_count: number;
  total_tokens_used: number;
  quota_tokens: number;
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
  created_at: string;
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

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse<T>(res);
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  token: string
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  token: string
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
    getUsageLogs: (query: UsageLogsQuery = {}) => {
      const params = new URLSearchParams();
      if (query.model_tag) params.set("model_tag", query.model_tag);
      if (query.page !== undefined) params.set("page", String(query.page));
      if (query.per_page !== undefined) params.set("limit", String(query.per_page));
      const qs = params.toString();
      return apiGet<PaginatedLogs>(`/admin/usage-logs${qs ? `?${qs}` : ""}`, token);
    },
  };
}

export function makeKeysApi(token: string) {
  return {
    list: () => apiGet<ApiKeysResponse>("/keys", token),
    create: (name: string) => apiPost<CreateKeyResponse>("/keys", { name }, token),
    revoke: (id: string) => apiDelete<{ success: boolean }>(`/keys/${id}`, token),
  };
}
