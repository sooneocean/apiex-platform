# API Spec: Stripe 自助儲值

> **Source**: `s1_dev_spec.md` Section 4
> **Purpose**: Topup API contract — single source of truth
> **Created**: 2026-03-15

---

## Overview

Stripe 自助儲值功能提供用戶透過 Stripe Checkout Session 購買 quota_tokens，並透過 Webhook 自動到帳。

**Base URLs**:
- Topup API: `/topup/`（Supabase JWT，用戶操作）
- Topup Webhook: `/topup/webhook`（無 auth，Stripe 簽名驗證）
- Admin Topup API: `/admin/topup-logs`（Admin JWT）

**Authentication Schemes**:
| Scheme | Header | 適用 |
|--------|--------|------|
| Supabase JWT | `Authorization: Bearer <supabase_jwt>` | `/topup/checkout`、`/topup/status`、`/topup/logs` |
| Stripe Signature | `stripe-signature` header | `/topup/webhook` |
| Admin JWT | `Authorization: Bearer <supabase_jwt>` + email whitelist | `/admin/topup-logs` |

---

## Endpoints

### 1. Create Checkout Session

```
POST /topup/checkout
Authorization: Bearer <supabase_jwt>
Content-Type: application/json
```

> 建立 Stripe Checkout Session，回傳 Stripe 託管付款頁 URL。

**Request Body**
```json
{
  "plan_id": "plan_10"
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|-----------|-------------|
| `plan_id` | string | Yes | `plan_5` \| `plan_10` \| `plan_20` | 儲值方案 ID |

**固定方案對照表**

| plan_id | 金額 (USD) | 金額 (cents) | tokens_granted |
|---------|-----------|-------------|----------------|
| `plan_5` | $5 | 500 | 500,000 |
| `plan_10` | $10 | 1,000 | 1,000,000 |
| `plan_20` | $20 | 2,000 | 2,000,000 |

**Response -- Success (200)**
```json
{
  "data": {
    "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_xxx",
    "session_id": "cs_test_xxx"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `checkout_url` | string | Stripe Checkout Session URL，前端直接 redirect |
| `session_id` | string | Checkout Session ID，用於後續 status 查詢 |

**Error Codes**

| HTTP | type | code | Trigger |
|------|------|------|---------|
| 400 | `invalid_request_error` | `invalid_plan` | `plan_id` 不在支援清單 |
| 401 | `authentication_error` | `invalid_token` | JWT 無效或過期 |
| 500 | `server_error` | `stripe_error` | Stripe API 呼叫失敗 |

---

### 2. Stripe Webhook

```
POST /topup/webhook
stripe-signature: t=1710400000,v1=xxx
Content-Type: application/json (raw body)
```

> 接收 Stripe Webhook 事件。無 JWT auth，使用 Stripe 簽名驗證。

**處理邏輯**:
1. 使用 `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)` 驗證簽名
2. 只處理 `checkout.session.completed` 事件
3. 從 session metadata 取 `user_id`、`plan_id`、`tokens_granted`
4. 冪等寫入 topup_logs（`stripe_event_id` UNIQUE constraint）
5. 累加 quota_tokens 到 `user_quotas` + 所有 active `api_keys`

**Response -- Success**
```json
{ "received": true }
```

**Error Codes**

| HTTP | type | code | Trigger |
|------|------|------|---------|
| 400 | `invalid_request_error` | `invalid_signature` | Stripe 簽名驗證失敗 |
| 200 | - | - | 重複 event_id（冪等，視為成功） |
| 200 | - | - | 非 `checkout.session.completed` 事件（忽略） |

---

### 3. Query Topup Status

```
GET /topup/status?session_id={checkout_session_id}
Authorization: Bearer <supabase_jwt>
```

> 成功頁 polling 用。查詢指定 Checkout Session 的處理狀態。

**Query Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `session_id` | string | Yes | Stripe Checkout Session ID |

**Response -- Success (200)**
```json
{
  "data": {
    "status": "completed",
    "tokens_granted": 1000000,
    "completed_at": "2026-03-15T03:00:00Z"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `pending` \| `completed`。`pending` 表示 Webhook 尚未處理 |
| `tokens_granted` | number \| null | 已授予的 tokens 數量（pending 時為 null） |
| `completed_at` | string \| null | 完成時間（pending 時為 null） |

> **注意**：`pending` 不代表 topup_logs 有記錄，而是查無對應 session_id 的 completed 記錄。Webhook 只在成功時寫入（status=completed），所以查無記錄 = pending。

**Error Codes**

| HTTP | type | code | Trigger |
|------|------|------|---------|
| 400 | `invalid_request_error` | `missing_session_id` | 未提供 session_id |
| 401 | `authentication_error` | `invalid_token` | JWT 無效或過期 |

---

### 4. User Topup Logs

```
GET /topup/logs
Authorization: Bearer <supabase_jwt>
```

> 用戶查看自己的充值記錄。

**Query Parameters**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `page` | integer | No | 1 | 分頁 |
| `limit` | integer | No | 20 | 每頁筆數（max 100） |

**Response -- Success (200)**
```json
{
  "data": [
    {
      "id": "uuid",
      "amount_usd": 1000,
      "tokens_granted": 1000000,
      "status": "completed",
      "created_at": "2026-03-15T03:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | topup_logs 記錄 ID |
| `amount_usd` | integer | 金額（美分，1000 = $10） |
| `tokens_granted` | bigint | 授予的 tokens 數量 |
| `status` | string | `completed` |
| `created_at` | string | 建立時間 |

> 不回傳 `stripe_session_id`、`stripe_event_id`、`user_id`（前端不需要）。

**Error Codes**

| HTTP | type | code | Trigger |
|------|------|------|---------|
| 401 | `authentication_error` | `invalid_token` | JWT 無效或過期 |

---

### 5. Admin Topup Logs

```
GET /admin/topup-logs
Authorization: Bearer <admin_jwt>
```

> Admin 查看所有用戶的充值記錄。

**Query Parameters**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `page` | integer | No | 1 | 分頁 |
| `limit` | integer | No | 50 | 每頁筆數（max 200） |
| `user_id` | uuid | No | - | 篩選特定用戶 |

**Response -- Success (200)**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "user_email": "user@example.com",
      "stripe_session_id": "cs_test_xxx",
      "amount_usd": 1000,
      "tokens_granted": 1000000,
      "status": "completed",
      "created_at": "2026-03-15T03:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 100 }
}
```

**Error Codes**

| HTTP | type | code | Trigger |
|------|------|------|---------|
| 401 | `authentication_error` | `invalid_token` | JWT 無效或過期 |
| 403 | `authorization_error` | `admin_required` | 非 admin 存取 |

---

## Shared Error Format

沿用既有 OpenAI 相容格式：

```json
{
  "error": {
    "message": "Error description for humans",
    "type": "error_category",
    "code": "specific_error_code"
  }
}
```

---

## Notes

- Webhook endpoint **不經過** JWT auth middleware，直接掛載在 app 層級
- Webhook 需要 raw request body 做簽名驗證，在 Hono 中使用 `c.req.text()` 取得
- 所有金額欄位使用**美分**（cents），避免浮點精度問題
- `quota_tokens` 累加邏輯與 `PATCH /admin/users/:id/quota` 一致：同時更新 `user_quotas.default_quota_tokens` 與所有 active `api_keys.quota_tokens`
- 用戶側 API（`/topup/*`）使用 `{ data: ... }` wrapper，與既有 Keys/Admin API 風格一致
