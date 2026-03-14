# API Spec: Apiex Platform (MVP)

> **Source**: Extracted from `s1_dev_spec.md` Section 4.2
> **Purpose**: Shared API contract — single source of truth
> **Created**: 2026-03-14 03:00

---

## Overview

Apiex 提供 OpenAI 相容的 AI API 中轉服務，包含 Proxy API（核心）、Auth API、Keys API、Usage API 與 Admin API。

**Base URLs**:
- Proxy API: `/v1/`（OpenAI 相容，API Key 認證）
- Auth API: `/auth/`（Supabase JWT）
- Keys API: `/keys/`（Supabase JWT）
- Admin API: `/admin/`（Admin JWT）

**Authentication Schemes**:
| Scheme | Header | 適用 |
|--------|--------|------|
| API Key | `Authorization: Bearer apx-sk-xxx` | `/v1/*`、`/usage/*` |
| Supabase JWT | `Authorization: Bearer <supabase_jwt>` | `/auth/*`、`/keys/*` |
| Admin JWT | `Authorization: Bearer <supabase_jwt>` + email whitelist | `/admin/*` |

---

## Endpoints

### 1. Chat Completions（核心 Proxy）

```
POST /v1/chat/completions
Authorization: Bearer apx-sk-xxx
Content-Type: application/json
```

> 與 OpenAI `POST /v1/chat/completions` 完全相容。

**Request Body**
```json
{
  "model": "apex-smart",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello" }
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1024
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|-----------|-------------|
| `model` | string | Yes | `apex-smart` \| `apex-cheap` \| 具體 model ID | 路由標籤或上游 model ID |
| `messages` | array | Yes | ≥1 個 message | OpenAI messages 格式 |
| `stream` | boolean | No | - | 預設 `false`，`true` 時回傳 SSE |
| `temperature` | number | No | 0~2 | 透傳到上游 |
| `max_tokens` | integer | No | ≥1 | 透傳到上游（Anthropic 預設 4096） |

**Response — Success（Non-Streaming）**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1710400000,
  "model": "claude-opus-4-6",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello! How can I help you?" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 8,
    "total_tokens": 20
  }
}
```

**Response — Success（Streaming, `stream: true`）**

Content-Type: `text/event-stream`

```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1710400000,"model":"claude-opus-4-6","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1710400000,"model":"claude-opus-4-6","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1710400000,"model":"claude-opus-4-6","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}

data: [DONE]
```

**Error Codes**

| HTTP | type | code | Trigger |
|------|------|------|---------|
| 400 | `invalid_request_error` | `unsupported_model` | `model` 不在支援清單 |
| 401 | `authentication_error` | `invalid_api_key` | API Key 無效或已撤銷 |
| 402 | `insufficient_quota` | `quota_exhausted` | 額度耗盡 |
| 502 | `server_error` | `upstream_timeout` | 上游 >30s 未回應 |
| 502 | `server_error` | `upstream_error` | 上游回傳非預期格式 |
| 503 | `server_error` | `route_not_configured` | route_config 無有效記錄 |

---

### 2. List Models

```
GET /v1/models
Authorization: Bearer apx-sk-xxx
```

**Response — Success**
```json
{
  "object": "list",
  "data": [
    {
      "id": "apex-smart",
      "object": "model",
      "created": 1710400000,
      "owned_by": "apiex",
      "upstream_provider": "anthropic",
      "upstream_model": "claude-opus-4-6"
    },
    {
      "id": "apex-cheap",
      "object": "model",
      "created": 1710400000,
      "owned_by": "apiex",
      "upstream_provider": "google",
      "upstream_model": "gemini-2.0-flash"
    }
  ]
}
```

---

### 3. Login（MVP 簡化版）

```
POST /auth/login
Content-Type: application/json
```

**Request Body**
```json
{
  "access_token": "<supabase_access_token>"
}
```

**Response — Success**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  },
  "session": {
    "access_token": "jwt...",
    "expires_at": 1710486400
  }
}
```

| HTTP | Error | Trigger |
|------|-------|---------|
| 401 | `invalid_token` | access_token 無效或過期 |

---

### 4. List API Keys

```
GET /keys
Authorization: Bearer <supabase_jwt>
```

**Response — Success**
```json
{
  "data": [
    {
      "id": "uuid",
      "key_prefix": "apx-sk-abc1",
      "name": "my-agent",
      "status": "active",
      "quota_tokens": 50000,
      "created_at": "2026-03-14T00:00:00Z"
    }
  ]
}
```

---

### 5. Create API Key

```
POST /keys
Authorization: Bearer <supabase_jwt>
Content-Type: application/json
```

**Request Body**
```json
{
  "name": "my-agent"
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|-----------|-------------|
| `name` | string | No | 0~100 chars | Key 名稱（預設空字串） |

**Response — Success (201)**
```json
{
  "data": {
    "id": "uuid",
    "key": "apx-sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678",
    "key_prefix": "apx-sk-aBcD",
    "name": "my-agent",
    "status": "active",
    "quota_tokens": -1,
    "created_at": "2026-03-14T00:00:00Z"
  },
  "warning": "This key will not be shown again. Store it securely."
}
```

> `key` 欄位僅在建立時回傳一次，之後只能看到 `key_prefix`。

**Rate Limit**: 同用戶 1 秒內限建 1 個 Key。

| HTTP | Error | Trigger |
|------|-------|---------|
| 403 | `quota_exhausted` | 額度為 0 時禁止建立新 Key |
| 429 | `rate_limit` | 1 秒內重複建立 |

---

### 6. Revoke API Key

```
DELETE /keys/:id
Authorization: Bearer <supabase_jwt>
```

**Response — Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "status": "revoked",
    "revoked_at": "2026-03-14T01:00:00Z"
  }
}
```

| HTTP | Error | Trigger |
|------|-------|---------|
| 404 | `key_not_found` | Key 不存在或不屬於當前用戶 |

---

### 7. Usage Summary

```
GET /usage/summary
Authorization: Bearer apx-sk-xxx  (或 Supabase JWT)
```

**Query Parameters**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `period` | string | No | `30d` | `24h` \| `7d` \| `30d` \| `all` |

**Response — Success**
```json
{
  "data": {
    "total_tokens": 125000,
    "total_requests": 47,
    "quota_remaining": 375000,
    "breakdown": [
      { "model_tag": "apex-smart", "tokens": 100000, "requests": 12 },
      { "model_tag": "apex-cheap", "tokens": 25000, "requests": 35 }
    ]
  }
}
```

---

### 8. Admin: List Users

```
GET /admin/users
Authorization: Bearer <admin_jwt>
```

**Query Parameters**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `page` | integer | No | 1 | 分頁 |
| `limit` | integer | No | 20 | 每頁筆數（max 100） |

**Response — Success**
```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "key_count": 3,
      "total_tokens_used": 125000,
      "quota_tokens": 500000,
      "created_at": "2026-03-14T00:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5 }
}
```

---

### 9. Admin: Set User Quota

```
PATCH /admin/users/:id/quota
Authorization: Bearer <admin_jwt>
Content-Type: application/json
```

**Request Body**
```json
{
  "quota_tokens": 1000000
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|-----------|-------------|
| `quota_tokens` | bigint | Yes | ≥-1（-1 = 無限） | 設定至該用戶所有 active keys |

**Response — Success**
```json
{
  "data": {
    "user_id": "uuid",
    "updated_keys": 3,
    "quota_tokens": 1000000
  }
}
```

---

### 10. Admin: Query Usage Logs

```
GET /admin/usage-logs
Authorization: Bearer <admin_jwt>
```

**Query Parameters**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `page` | integer | No | 1 | 分頁 |
| `limit` | integer | No | 50 | 每頁筆數（max 200） |
| `user_id` | uuid | No | - | 篩選用戶 |
| `model_tag` | string | No | - | `apex-smart` \| `apex-cheap` |
| `from` | ISO8601 | No | - | 起始時間 |
| `to` | ISO8601 | No | - | 結束時間 |

**Response — Success**
```json
{
  "data": [
    {
      "id": "uuid",
      "api_key_prefix": "apx-sk-abc1",
      "model_tag": "apex-smart",
      "upstream_model": "claude-opus-4-6",
      "prompt_tokens": 100,
      "completion_tokens": 50,
      "total_tokens": 150,
      "latency_ms": 1200,
      "status": "success",
      "created_at": "2026-03-14T01:30:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1200 }
}
```

---

## Shared Error Format

所有錯誤均使用 OpenAI 相容格式：

```json
{
  "error": {
    "message": "Error description for humans",
    "type": "error_category",
    "code": "specific_error_code"
  }
}
```

### Shared Error Codes

| HTTP | type | code | Description |
|------|------|------|-------------|
| 401 | `authentication_error` | `invalid_api_key` | API Key 無效 / 已撤銷 / 格式錯誤 |
| 401 | `authentication_error` | `invalid_token` | Supabase JWT 無效或過期 |
| 403 | `authorization_error` | `admin_required` | 非管理員嘗試存取 /admin/* |
| 429 | `rate_limit_error` | `rate_limit` | 觸發速率限制 |
| 500 | `server_error` | `internal_error` | 未預期的伺服器錯誤 |

---

## Notes

- Proxy API（`/v1/*`）的 response 格式與 OpenAI API **完全相容**，確保 OpenAI SDK 零改動可用。
- 非 Proxy 的管理類 API 使用 `{ data: ... }` wrapper，與 Proxy API 的 OpenAI 格式分開。
- Streaming 回應的 `usage` 欄位在最後一個 chunk 中（`finish_reason: "stop"` 的那個 chunk）。
- `quota_tokens = -1` 代表無限制，不進行額度檢查。
