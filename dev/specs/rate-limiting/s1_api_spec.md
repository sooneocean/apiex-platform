# API Spec: Rate Limiting

> **Source**: Extracted from `s1_dev_spec.md` Section 4.1
> **Purpose**: Shared API contract between frontend and backend -- single source of truth
> **Created**: 2026-03-15 05:00

---

## Overview

Rate limiting 相關的 API 變更：新增 Admin 端點設定用戶 tier，定義 429 回應格式與 rate limit response headers。

**Base URL**: `/admin/` (Admin API), `/v1/` (Proxy API)
**Authentication**: Admin JWT (Admin API), API Key Bearer (Proxy API)

---

## Endpoints

### 1. 設定用戶 Rate Limit Tier

```
PATCH /admin/users/:id/rate-limit
Authorization: Bearer {admin_jwt}
Content-Type: application/json
```

**Parameters**

| Name | Location | Type | Required | Default | Description |
|------|----------|------|----------|---------|-------------|
| `id` | path | string (UUID) | Yes | - | 目標用戶的 user_id |

**Request Body**
```json
{
  "tier": "pro"
}
```

| Field | Type | Required | Validation Rules | Description |
|-------|------|----------|-----------------|-------------|
| `tier` | string | Yes | Must exist in `rate_limit_tiers` table | Rate limit tier 名稱 |

**有效 tier 值**

| Tier | RPM | TPM | 說明 |
|------|-----|-----|------|
| `free` | 20 | 100,000 | 預設，免費用戶 |
| `pro` | 60 | 500,000 | 付費用戶 |
| `unlimited` | -1 | -1 | 無限制 |

**Response -- Success (200)**
```json
{
  "data": {
    "user_id": "uuid-string",
    "updated_keys": 2,
    "tier": "pro"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.user_id` | string (UUID) | 被更新的用戶 ID |
| `data.updated_keys` | number | 被更新的 active API keys 數量 |
| `data.tier` | string | 新設定的 tier |

**Response -- Error**

| HTTP Status | Error Code | Type | Description | Trigger Condition |
|-------------|-----------|------|-------------|-------------------|
| 400 | `invalid_tier` | `invalid_request_error` | Tier 不存在 | tier 值不在 rate_limit_tiers 表中 |
| 401 | `invalid_token` | `authentication_error` | 未認證 | 缺少或無效的 JWT |
| 403 | `admin_required` | `authorization_error` | 非 Admin | 用戶不是 admin 角色 |
| 500 | `internal_error` | `server_error` | 伺服器錯誤 | DB 操作失敗 |

```json
{
  "error": {
    "message": "Invalid tier. Valid values: free, pro, unlimited.",
    "type": "invalid_request_error",
    "code": "invalid_tier"
  }
}
```

---

## Rate Limit Response Headers

> 以下 headers 附加在所有 `/v1/*` proxy 請求的回應上（成功與 429 都有）。
> unlimited tier 不附加這些 headers。

| Header | Type | Description | Example |
|--------|------|-------------|---------|
| `X-RateLimit-Limit-Requests` | integer | RPM 上限 | `20` |
| `X-RateLimit-Limit-Tokens` | integer | TPM 上限 | `100000` |
| `X-RateLimit-Remaining-Requests` | integer | 當前 window 剩餘可用請求數 | `15` |
| `X-RateLimit-Remaining-Tokens` | integer | 當前 window 剩餘可用 token 數 | `85000` |
| `Retry-After` | integer | 建議等待秒數（僅 429 回應時） | `12` |

---

## 429 Rate Limit Exceeded Response

> 當 RPM 或 TPM 超過限制時回傳。格式遵循 OpenAI API error schema。

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 12
X-RateLimit-Limit-Requests: 20
X-RateLimit-Limit-Tokens: 100000
X-RateLimit-Remaining-Requests: 0
X-RateLimit-Remaining-Tokens: 85000
```

```json
{
  "error": {
    "message": "Rate limit exceeded. Please retry after 12 seconds.",
    "type": "rate_limit_error",
    "code": "rate_limit"
  }
}
```

**429 觸發條件**

| 條件 | 說明 |
|------|------|
| RPM 超限 | 過去 60 秒內該 key 的請求數 >= tier.rpm |
| TPM 超限 | 過去 60 秒內該 key 的 token 用量 >= tier.tpm |

**Retry-After 計算邏輯**

`Retry-After = ceil((oldest_entry_in_window.timestamp + 60000 - now) / 1000)`

即：等到最早的 window entry 過期的秒數。

---

## Shared Definitions

### OpenAI Error Format (existing)

所有 error 回應遵循既有格式：

```json
{
  "error": {
    "message": "Human-readable error message",
    "type": "error_type",
    "code": "error_code"
  }
}
```

### Admin Users Response (updated)

`GET /admin/users` 回傳的 `AdminUser` 新增 `rate_limit_tier` 欄位：

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "key_count": 2,
      "total_tokens_used": 50000,
      "quota_tokens": 1000000,
      "rate_limit_tier": "free",
      "created_at": "2026-03-10T00:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5 }
}
```

---

## Notes

- Rate limit headers 命名遵循 OpenAI API 慣例（`X-RateLimit-Limit-Requests` 等）
- `Retry-After` header 遵循 HTTP/1.1 標準（RFC 7231 Section 7.1.3），使用秒數格式
- unlimited tier (-1) 完全跳過 rate limit 邏輯，不附加任何 rate limit headers
- Tier 變更不即時生效（有 ~60 秒 cache delay），這是設計決策而非 bug
