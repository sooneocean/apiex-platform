# API Spec: Webhook 用量通知（擴展）

> **Source**: Extracted from `s1_dev_spec.md` Section 4.1
> **Purpose**: Shared API contract between frontend and backend -- single source of truth
> **Created**: 2026-03-15 10:30

---

## Overview

擴展現有 Webhook API，新增 Admin 總覽 endpoint，並定義統一的 Webhook notification payload 格式。

**Base URL**: `/`
**Authentication**: Bearer JWT (Supabase) for user endpoints, Admin JWT for admin endpoints

---

## Endpoints

### 1. 取得用戶 Webhook 設定（已存在）

```
GET /webhooks
Authorization: Bearer {supabase_jwt}
```

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "url": "https://example.com/hook",
    "secret": "optional-secret",
    "events": ["quota_warning", "quota_exhausted", "spend_warning", "spend_limit_reached"],
    "is_active": true,
    "created_at": "2026-03-15T00:00:00Z"
  }
}
```

**Response -- No config (200)**
```json
{
  "data": null
}
```

---

### 2. 建立/更新 Webhook 設定（已存在，events 擴展）

```
POST /webhooks
Authorization: Bearer {supabase_jwt}
Content-Type: application/json
```

**Request Body**
```json
{
  "url": "https://example.com/hook",
  "secret": "optional-hmac-secret",
  "events": ["quota_warning", "quota_exhausted", "spend_warning", "spend_limit_reached"]
}
```

| Field | Type | Required | Validation Rules | Description |
|-------|------|----------|-----------------|-------------|
| `url` | string | Yes | 必須是 http:// 或 https:// URL | Webhook endpoint URL |
| `secret` | string | No | - | HMAC-SHA256 簽名用 secret |
| `events` | string[] | No | 有效值: quota_warning, quota_exhausted, spend_warning, spend_limit_reached | 訂閱的事件列表，預設 ["quota_warning"] |

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "url": "https://example.com/hook",
    "secret": "optional-secret",
    "events": ["quota_warning", "quota_exhausted", "spend_warning", "spend_limit_reached"],
    "is_active": true,
    "created_at": "2026-03-15T00:00:00Z"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_parameter` | Invalid webhook URL | URL 不是有效的 http/https 格式 |

---

### 3. 刪除 Webhook 設定（已存在）

```
DELETE /webhooks/:id
Authorization: Bearer {supabase_jwt}
```

**Response -- Success (200)**
```json
{
  "data": { "id": "uuid", "deleted": true }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 404 | `not_found` | Config not found | config 不存在或不屬於此用戶 |

---

### 4. 查看推播記錄（已存在）

```
GET /webhooks/:id/logs
Authorization: Bearer {supabase_jwt}
```

**Response -- Success (200)**
```json
{
  "data": [
    {
      "id": "uuid",
      "webhook_config_id": "uuid",
      "event": "quota_warning",
      "payload": {
        "event_type": "quota_warning",
        "key_id": "uuid",
        "key_prefix": "apx-sk-a",
        "current_value": 1500,
        "threshold": 2000,
        "timestamp": "2026-03-15T12:00:00Z"
      },
      "status_code": 200,
      "response_body": "OK",
      "created_at": "2026-03-15T12:00:00Z"
    }
  ]
}
```

---

### 5. 發送測試推播（已存在，payload 更新）

```
POST /webhooks/test
Authorization: Bearer {supabase_jwt}
```

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "webhook_config_id": "uuid",
    "event": "test",
    "payload": {
      "event_type": "test",
      "key_id": "test",
      "key_prefix": "test",
      "current_value": 0,
      "threshold": 0,
      "timestamp": "2026-03-15T12:00:00Z",
      "is_test": true
    },
    "status_code": 200,
    "response_body": "OK",
    "created_at": "2026-03-15T12:00:00Z"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 404 | `not_found` | No webhook config | 用戶未設定 webhook |

---

### 6. Admin 查看所有 Webhook 設定（新增）

```
GET /admin/webhooks
Authorization: Bearer {admin_jwt}
```

**Parameters**

| Name | Location | Type | Required | Default | Description |
|------|----------|------|----------|---------|-------------|
| `page` | query | integer | No | 1 | 頁碼 |
| `limit` | query | integer | No | 20 | 每頁筆數（max 100） |

**Response -- Success (200)**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "url": "https://example.com/hook",
      "events": ["quota_warning", "spend_warning"],
      "is_active": true,
      "created_at": "2026-03-15T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5
  }
}
```

> **安全注意**：Admin endpoint 不回傳 `secret` 欄位。

---

## Shared Definitions

### Webhook Notification Payload（統一格式）

所有自動推播的 webhook 使用以下統一格式：

```json
{
  "event_type": "quota_warning | quota_exhausted | spend_warning | spend_limit_reached",
  "key_id": "uuid-string",
  "key_prefix": "apx-sk-a",
  "current_value": 1500,
  "threshold": 2000,
  "timestamp": "2026-03-15T12:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event_type` | string | 事件類型 |
| `key_id` | string (UUID) | 觸發此事件的 API Key ID |
| `key_prefix` | string | API Key 的 prefix（前 8 字元），用於用戶識別 |
| `current_value` | number | 當前值（配額事件=剩餘 token、花費事件=已花費 cents） |
| `threshold` | number | 門檻值（配額事件=20% 門檻 token 數、花費事件=limit 的 80% 或 100%） |
| `timestamp` | string (ISO8601) | 事件觸發時間 |

### 有效事件類型

| event_type | 觸發條件 | current_value 語義 | threshold 語義 |
|------------|---------|-------------------|---------------|
| `quota_warning` | 配額剩餘 < 20% 且 > 0 | 剩餘 token 數 | quota_tokens * 0.2 |
| `quota_exhausted` | 配額剩餘 = 0 | 0 | 原始 quota_tokens |
| `spend_warning` | 花費 > 80% spend_limit 且 < 100% | spent_usd (cents) | spend_limit_usd * 0.8 |
| `spend_limit_reached` | 花費 >= spend_limit | spent_usd (cents) | spend_limit_usd |

### HMAC-SHA256 簽名

若用戶設定了 `secret`，webhook POST 請求會包含簽名 header：

```
X-Webhook-Signature: sha256=<hmac_hex_digest>
```

簽名對象為完整的 JSON request body 字串。

### Shared Error Codes

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 401 | `unauthorized` | Not authenticated or JWT expired |
| 403 | `forbidden` | Not an admin (for /admin/* endpoints) |
| 500 | `internal_error` | Internal server error |

---

## Notes

- Webhook 推播是 fire-and-forget，不保證送達。失敗會記錄在 webhook_logs 但不會重試。
- dedup 視窗為 1 小時：同一 event_type + key_id 在 1 小時內只會發送一次。
- Admin endpoint 故意排除 `secret` 欄位以保護用戶隱私。
- `events` 欄位控制用戶訂閱的事件類型，未訂閱的事件不會觸發推播。
