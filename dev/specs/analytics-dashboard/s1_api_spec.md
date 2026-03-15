# API Spec: Analytics Dashboard

> **Source**: Extracted from `s1_dev_spec.md` Section 4.1
> **Purpose**: Shared API contract between frontend and backend -- single source of truth
> **Created**: 2026-03-15 16:30

---

## Overview

新增 11 個 API endpoints 支援 Analytics Dashboard：4 個用戶端聚合 API、3 個 Admin 聚合 API、3 個費率管理 API、1 個角色識別 API。

**Base URL**: `/`
**Authentication**: Supabase JWT（用戶端） / Admin JWT（ADMIN_EMAILS whitelist，Admin 端）

---

## Shared Definitions

### Common Query Parameters

| Name | Location | Type | Required | Default | Description |
|------|----------|------|----------|---------|-------------|
| `period` | query | string | No | `7d` | 時間範圍：`24h` / `7d` / `30d` |
| `key_id` | query | string (UUID) | No | - | 篩選特定 API Key（僅用戶端 endpoints） |

### Granularity Auto-Rule

| period | Granularity | Data Points |
|--------|------------|-------------|
| `24h` | `hour` | 24 |
| `7d` | `day` | 7 |
| `30d` | `day` | 30 |

### Shared Error Codes

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 400 | `invalid_request_error` | 參數驗證失敗（不合法 period、key_id 非用戶所有） |
| 401 | `invalid_token` | JWT 無效或過期 |
| 403 | `admin_required` | 非 Admin 存取 Admin endpoints |
| 504 | `gateway_timeout` | 聚合查詢超過 10 秒 timeout |

### Shared Response Envelope

所有成功回應使用 `{ data: T }` 格式，與現有 API 一致。

---

## Endpoints

### 1. Get Current User Info

```
GET /auth/me
Authorization: Bearer {supabase_jwt}
```

**Parameters**: None

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid-string",
    "email": "user@example.com",
    "isAdmin": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.id` | string (UUID) | Supabase user ID |
| `data.email` | string | 用戶 email |
| `data.isAdmin` | boolean | 是否為 Admin（依據 ADMIN_EMAILS env var） |

**Error Codes**

| HTTP Status | Error Code | Trigger Condition |
|-------------|-----------|-------------------|
| 401 | `invalid_token` | JWT 無效或過期 |

---

### 2. User Timeseries (Token Usage)

```
GET /analytics/timeseries?period=7d&key_id={uuid}
Authorization: Bearer {supabase_jwt}
```

**Parameters**

| Name | Location | Type | Required | Default | Description |
|------|----------|------|----------|---------|-------------|
| `period` | query | string | No | `7d` | `24h` / `7d` / `30d` |
| `key_id` | query | UUID | No | - | 篩選特定 key |

**Response -- Success (200)**
```json
{
  "data": {
    "period": "7d",
    "granularity": "day",
    "series": [
      {
        "timestamp": "2026-03-08T00:00:00Z",
        "apex-smart": { "prompt_tokens": 1200, "completion_tokens": 800, "total_tokens": 2000 },
        "apex-cheap": { "prompt_tokens": 500, "completion_tokens": 300, "total_tokens": 800 }
      }
    ],
    "totals": {
      "prompt_tokens": 12000,
      "completion_tokens": 8000,
      "total_tokens": 20000,
      "total_requests": 150
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.period` | string | 查詢的時間範圍 |
| `data.granularity` | string | 自動決定的粒度（hour/day） |
| `data.series[]` | array | 時序數據點 |
| `data.series[].timestamp` | string (ISO8601) | 時間桶起始時間（UTC） |
| `data.series[].[model_tag]` | object | 各 model 的 token 數據 |
| `data.totals` | object | 期間合計 |

**Error Codes**

| HTTP Status | Error Code | Trigger Condition |
|-------------|-----------|-------------------|
| 400 | `invalid_request_error` | period 非合法值、key_id 不屬於用戶 |
| 504 | `gateway_timeout` | 查詢超過 10 秒 |

---

### 3. User Model Breakdown

```
GET /analytics/model-breakdown?period=7d&key_id={uuid}
Authorization: Bearer {supabase_jwt}
```

**Parameters**: 同 Endpoint #2

**Response -- Success (200)**
```json
{
  "data": {
    "period": "7d",
    "breakdown": [
      {
        "model_tag": "apex-smart",
        "total_tokens": 15000,
        "total_requests": 100,
        "percentage": 65.2
      },
      {
        "model_tag": "apex-cheap",
        "total_tokens": 8000,
        "total_requests": 80,
        "percentage": 34.8
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.breakdown[].model_tag` | string | Model 標籤 |
| `data.breakdown[].total_tokens` | number | 該 model 總 tokens |
| `data.breakdown[].total_requests` | number | 該 model 總請求數 |
| `data.breakdown[].percentage` | number | 佔比（%） |

---

### 4. User Latency Timeseries

```
GET /analytics/latency?period=7d&key_id={uuid}
Authorization: Bearer {supabase_jwt}
```

**Parameters**: 同 Endpoint #2

**Response -- Success (200)**
```json
{
  "data": {
    "period": "7d",
    "granularity": "day",
    "series": [
      {
        "timestamp": "2026-03-08T00:00:00Z",
        "apex-smart": { "p50": 320, "p95": 890, "p99": 1200 },
        "apex-cheap": { "p50": 150, "p95": 420, "p99": 650 }
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.series[].[model_tag].p50` | number | 中位數延遲（ms） |
| `data.series[].[model_tag].p95` | number | 95th 百分位延遲（ms） |
| `data.series[].[model_tag].p99` | number | 99th 百分位延遲（ms） |

> 只計算 `status = 'success'` 的記錄。

---

### 5. User Billing Summary

```
GET /analytics/billing?period=30d
Authorization: Bearer {supabase_jwt}
```

**Parameters**

| Name | Location | Type | Required | Default | Description |
|------|----------|------|----------|---------|-------------|
| `period` | query | string | No | `30d` | 帳單計算期間 |

**Response -- Success (200)**
```json
{
  "data": {
    "period": "30d",
    "cost": {
      "total_usd": 12.45,
      "breakdown": [
        {
          "model_tag": "apex-smart",
          "prompt_tokens": 50000,
          "completion_tokens": 30000,
          "input_cost_usd": 5.00,
          "output_cost_usd": 6.00,
          "total_cost_usd": 11.00,
          "rate": { "input_rate_per_1k": 0.10, "output_rate_per_1k": 0.20 }
        }
      ]
    },
    "quota": {
      "total_quota_tokens": 1000000,
      "is_unlimited": false,
      "estimated_days_remaining": 14.5,
      "daily_avg_consumption": 2857
    },
    "recent_topups": [
      {
        "id": "uuid",
        "amount_usd": 10,
        "tokens_granted": 500000,
        "created_at": "2026-03-01T10:00:00Z"
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.cost` | object / null | 費用摘要。若費率未設定，整個欄位為 `null` |
| `data.cost.total_usd` | number | 期間總費用（USD） |
| `data.cost.breakdown[]` | array | 按 model 的費用明細 |
| `data.cost.breakdown[].rate` | object | 使用的費率（歷史費率） |
| `data.quota.total_quota_tokens` | number | 用戶所有 active keys 配額合計 |
| `data.quota.is_unlimited` | boolean | 是否為無限制配額（任一 key 為 -1） |
| `data.quota.estimated_days_remaining` | number / null | 預估剩餘天數（無限制時為 null） |
| `data.quota.daily_avg_consumption` | number | 近 7 日日均消耗 tokens |
| `data.recent_topups[]` | array | 最近 5 筆充值記錄 |

> **費率未設定行為**：若 `model_rates` 無對應 model 的費率記錄，`cost` 回傳 `null`。前端應顯示「費率未設定，請聯絡管理員」。

---

### 6. Admin Platform Overview

```
GET /admin/analytics/overview?period=7d
Authorization: Bearer {admin_jwt}
```

**Parameters**

| Name | Location | Type | Required | Default | Description |
|------|----------|------|----------|---------|-------------|
| `period` | query | string | No | `7d` | `24h` / `7d` / `30d` |

**Response -- Success (200)**
```json
{
  "data": {
    "period": "7d",
    "total_tokens": 5000000,
    "total_requests": 25000,
    "active_users": 42,
    "avg_latency_ms": 280,
    "series": [
      {
        "timestamp": "2026-03-08T00:00:00Z",
        "apex-smart": { "total_tokens": 300000, "requests": 1500 },
        "apex-cheap": { "total_tokens": 200000, "requests": 2000 }
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.total_tokens` | number | 全平台期間總 tokens |
| `data.total_requests` | number | 全平台期間總請求數 |
| `data.active_users` | number | 期間內有使用記錄的不重複用戶數 |
| `data.avg_latency_ms` | number | 全平台平均延遲 |
| `data.series[]` | array | 全平台時序（含 model 分欄） |

---

### 7. Admin Latency by Model

```
GET /admin/analytics/latency?period=7d
Authorization: Bearer {admin_jwt}
```

**Parameters**: 同 Endpoint #6

**Response -- Success (200)**
```json
{
  "data": {
    "period": "7d",
    "granularity": "day",
    "series": [
      {
        "timestamp": "2026-03-08T00:00:00Z",
        "apex-smart": { "p50": 310, "p95": 870, "p99": 1150 },
        "apex-cheap": { "p50": 140, "p95": 400, "p99": 620 }
      }
    ]
  }
}
```

> 格式與 User Latency (#4) 相同，但資料範圍為全平台。

---

### 8. Admin Top Users

```
GET /admin/analytics/top-users?period=7d&limit=10
Authorization: Bearer {admin_jwt}
```

**Parameters**

| Name | Location | Type | Required | Default | Description |
|------|----------|------|----------|---------|-------------|
| `period` | query | string | No | `7d` | 時間範圍 |
| `limit` | query | number | No | `10` | 回傳筆數上限（max 50） |

**Response -- Success (200)**
```json
{
  "data": {
    "period": "7d",
    "rankings": [
      {
        "user_id": "uuid",
        "email": "user@example.com",
        "total_tokens": 150000,
        "total_requests": 500,
        "total_cost_usd": 15.50
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.rankings[].user_id` | string (UUID) | 用戶 ID |
| `data.rankings[].email` | string | 用戶 email |
| `data.rankings[].total_tokens` | number | 期間總 tokens |
| `data.rankings[].total_requests` | number | 期間總請求數 |
| `data.rankings[].total_cost_usd` | number / null | 費用（費率未設定時為 null） |

---

### 9. List Model Rates

```
GET /admin/rates
Authorization: Bearer {admin_jwt}
```

**Parameters**: None

**Response -- Success (200)**
```json
{
  "data": [
    {
      "id": "uuid",
      "model_tag": "apex-smart",
      "input_rate_per_1k": 0.100000,
      "output_rate_per_1k": 0.200000,
      "effective_from": "2026-03-01T00:00:00Z",
      "created_at": "2026-03-01T00:00:00Z"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data[].id` | string (UUID) | 費率記錄 ID |
| `data[].model_tag` | string | Model 標籤 |
| `data[].input_rate_per_1k` | number | $/1K input tokens |
| `data[].output_rate_per_1k` | number | $/1K output tokens |
| `data[].effective_from` | string (ISO8601) | 生效時間 |
| `data[].created_at` | string (ISO8601) | 建立時間 |

---

### 10. Create Model Rate

```
POST /admin/rates
Authorization: Bearer {admin_jwt}
Content-Type: application/json
```

**Request Body**
```json
{
  "model_tag": "apex-smart",
  "input_rate_per_1k": 0.10,
  "output_rate_per_1k": 0.20,
  "effective_from": "2026-03-15T00:00:00Z"
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|-----------|-------------|
| `model_tag` | string | Yes | non-empty | Model 標籤（如 apex-smart, apex-cheap） |
| `input_rate_per_1k` | number | Yes | >= 0 | $/1K input tokens |
| `output_rate_per_1k` | number | Yes | >= 0 | $/1K output tokens |
| `effective_from` | string (ISO8601) | No | valid date | 生效時間，預設 now() |

**Response -- Success (201)**
```json
{
  "data": {
    "id": "uuid",
    "model_tag": "apex-smart",
    "input_rate_per_1k": 0.100000,
    "output_rate_per_1k": 0.200000,
    "effective_from": "2026-03-15T00:00:00Z",
    "created_at": "2026-03-15T10:00:00Z"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Trigger Condition |
|-------------|-----------|-------------------|
| 400 | `invalid_request_error` | 缺少必填欄位或 rate < 0 |

---

### 11. Update Model Rate

```
PATCH /admin/rates/:id
Authorization: Bearer {admin_jwt}
Content-Type: application/json
```

**Parameters**

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `id` | path | UUID | Yes | 費率記錄 ID |

**Request Body**
```json
{
  "input_rate_per_1k": 0.15,
  "output_rate_per_1k": 0.25
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|-----------|-------------|
| `input_rate_per_1k` | number | No | >= 0 | 更新的 input rate |
| `output_rate_per_1k` | number | No | >= 0 | 更新的 output rate |
| `effective_from` | string | No | valid date | 更新生效時間 |

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "model_tag": "apex-smart",
    "input_rate_per_1k": 0.150000,
    "output_rate_per_1k": 0.250000,
    "effective_from": "2026-03-15T00:00:00Z",
    "created_at": "2026-03-15T10:00:00Z"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Trigger Condition |
|-------------|-----------|-------------------|
| 400 | `invalid_request_error` | rate < 0 |
| 404 | `not_found` | 指定 ID 的費率不存在 |

---

## Notes

- 所有時間欄位皆為 UTC，前端顯示時標注「UTC」
- 費用計算公式：`cost = (prompt_tokens / 1000 * input_rate_per_1k) + (completion_tokens / 1000 * output_rate_per_1k)`
- 歷史費率查詢：取 `model_rates` 中 `model_tag = ? AND effective_from <= usage.created_at` 的最新一筆（ORDER BY effective_from DESC LIMIT 1）
- 所有聚合查詢設定 10 秒 statement timeout，超時回傳 504
- `topup_logs.amount_usd` 為 INTEGER（單位：美分），前端顯示時需除以 100
