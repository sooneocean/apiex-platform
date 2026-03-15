# API Spec: Per-Key Spend Limit

> **Source**: Extracted from `s1_dev_spec.md` Section 4.1
> **Purpose**: Shared API contract between frontend and backend -- single source of truth
> **Created**: 2026-03-15 10:00

---

## Overview

為 API Key 新增花費上限（spend limit）功能，擴充 Keys route 和 Admin route 的 API 端點。

**Base URL**: `/v1/` (user routes) / `/admin/` (admin routes)
**Authentication**: Bearer JWT (Supabase Auth) for `/v1/keys`; Bearer JWT + Admin role for `/admin/`

---

## Endpoints

### 1. Create API Key（擴充）

```
POST /v1/keys
Authorization: Bearer {jwt}
Content-Type: application/json
```

**Request Body**
```json
{
  "name": "my-key",
  "spend_limit_usd": 500
}
```

| Field | Type | Required | Validation Rules | Description |
|-------|------|----------|-----------------|-------------|
| `name` | string | No | 0~200 chars | Key 名稱 |
| `spend_limit_usd` | integer | No | >= -1 | 花費上限（美分）。-1 = 無限制（預設） |

**Response -- Success (201)**
```json
{
  "data": {
    "id": "uuid",
    "key": "apx-sk-...",
    "key_prefix": "apx-sk-a",
    "name": "my-key",
    "status": "active",
    "quota_tokens": -1,
    "spend_limit_usd": 500,
    "spent_usd": 0,
    "created_at": "2026-03-15T10:00:00Z"
  },
  "warning": "This key will not be shown again. Store it securely."
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_parameter` | spend_limit_usd must be >= -1 | spend_limit_usd < -1 |
| 429 | `rate_limit` | Rate limit exceeded | 1 key per second |

---

### 2. List API Keys（擴充）

```
GET /v1/keys
Authorization: Bearer {jwt}
```

**Response -- Success (200)**
```json
{
  "data": [
    {
      "id": "uuid",
      "key_prefix": "apx-sk-a",
      "name": "my-key",
      "status": "active",
      "quota_tokens": -1,
      "spend_limit_usd": 500,
      "spent_usd": 123,
      "created_at": "2026-03-15T10:00:00Z"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `spend_limit_usd` | integer | 花費上限（美分）。-1 = 無限制 |
| `spent_usd` | integer | 已花費（美分） |

---

### 3. Update API Key Spend Limit（新增）

```
PATCH /v1/keys/:id
Authorization: Bearer {jwt}
Content-Type: application/json
```

**Parameters**

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `id` | path | UUID | Yes | API Key ID |

**Request Body**
```json
{
  "spend_limit_usd": 1000
}
```

| Field | Type | Required | Validation Rules | Description |
|-------|------|----------|-----------------|-------------|
| `spend_limit_usd` | integer | Yes | >= -1 | 花費上限（美分） |

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "spend_limit_usd": 1000,
    "spent_usd": 123
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_parameter` | spend_limit_usd must be >= -1 | spend_limit_usd < -1 |
| 404 | `not_found` | Key not found | key_id 不存在或不屬於該用戶 |

---

### 4. Proxy Chat Completions（擴充 — 新增 402 error code）

```
POST /v1/chat/completions
Authorization: Bearer apx-sk-...
Content-Type: application/json
```

**新增 Error Code**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 402 | `spend_limit_exceeded` | Spend limit exceeded for this API key | spent_usd >= spend_limit_usd (when limit != -1) |

**Error Response**
```json
{
  "error": {
    "message": "Spend limit exceeded. Your API key has reached its spending cap.",
    "type": "insufficient_quota",
    "code": "spend_limit_exceeded"
  }
}
```

---

### 5. Admin: Get Key Spend Info（新增）

```
GET /admin/keys/:id/spend
Authorization: Bearer {jwt} (admin)
```

**Parameters**

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `id` | path | UUID | Yes | API Key ID |

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "name": "my-key",
    "key_prefix": "apx-sk-a",
    "user_id": "uuid",
    "spend_limit_usd": 500,
    "spent_usd": 123,
    "status": "active"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 404 | `not_found` | Key not found | key_id 不存在 |

---

### 6. Admin: Set Key Spend Limit（新增）

```
PATCH /admin/keys/:id/spend-limit
Authorization: Bearer {jwt} (admin)
Content-Type: application/json
```

**Request Body**
```json
{
  "spend_limit_usd": 1000
}
```

| Field | Type | Required | Validation Rules | Description |
|-------|------|----------|-----------------|-------------|
| `spend_limit_usd` | integer | Yes | >= -1 | 花費上限（美分） |

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "spend_limit_usd": 1000,
    "spent_usd": 123
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_parameter` | spend_limit_usd must be >= -1 | spend_limit_usd < -1 |
| 404 | `not_found` | Key not found | key_id 不存在 |

---

### 7. Admin: Reset Key Spend（新增）

```
POST /admin/keys/:id/reset-spend
Authorization: Bearer {jwt} (admin)
```

**Parameters**

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `id` | path | UUID | Yes | API Key ID |

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "spent_usd": 0,
    "spend_limit_usd": 500,
    "message": "Spend counter reset successfully"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 404 | `not_found` | Key not found | key_id 不存在 |

---

## Shared Definitions

### Spend Limit 語意

| 值 | 意義 |
|----|------|
| `-1` | 無限制（預設） |
| `0` | 完全禁止花費（所有請求被拒） |
| `> 0` | 花費上限（美分），例 `500` = $5.00 USD |

### Cost 計算公式

```
cost_cents = round((prompt_tokens * input_rate_per_1k + completion_tokens * output_rate_per_1k) / 1000 * 100)
```

- `input_rate_per_1k` / `output_rate_per_1k` 來自 `model_rates` 表
- 費率以 USD per 1K tokens 為單位
- 最終結果四捨五入為整數美分

### Shared Error Codes

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 401 | `invalid_api_key` | API key 無效或已撤銷 |
| 402 | `quota_exhausted` | Token 配額不足（現有） |
| 402 | `spend_limit_exceeded` | 花費超過上限（新增） |
| 403 | `admin_required` | 非 Admin 存取 Admin 端點 |

---

## Notes

- 402 狀態碼同時用於 `quota_exhausted` 和 `spend_limit_exceeded`，用戶端可透過 `error.code` 區分
- spend_limit_usd 和 spent_usd 使用美分 INTEGER 儲存，避免浮點精度問題
- 前端顯示時需 `/100` 轉為 USD 金額
