# API Spec: Rate Limiting v2 (Redis + Model Override + Admin CRUD)

> **Source**: Extracted from `s1_dev_spec.md` Section 4
> **Purpose**: Shared API contract between frontend and backend -- single source of truth
> **Created**: 2026-03-15 15:00

---

## Overview

新增 Rate Limit 管理 API：Tier CRUD、Model Override CRUD。文件化既有的用戶 tier 指派端點。

**Base URL**: `/admin`
**Authentication**: Bearer Admin JWT (all endpoints require `adminAuth` middleware)

---

## Endpoints

### 1. 列出所有 Tier

```
GET /admin/rate-limits/tiers
Authorization: Bearer {admin_jwt}
```

**Response -- Success (200)**
```json
{
  "data": [
    {
      "tier": "free",
      "rpm": 20,
      "tpm": 100000,
      "created_at": "2026-01-01T00:00:00Z"
    },
    {
      "tier": "pro",
      "rpm": 60,
      "tpm": 500000,
      "created_at": "2026-01-01T00:00:00Z"
    },
    {
      "tier": "unlimited",
      "rpm": -1,
      "tpm": -1,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

---

### 2. 新增 Tier

```
POST /admin/rate-limits/tiers
Authorization: Bearer {admin_jwt}
Content-Type: application/json
```

**Request Body**
```json
{
  "tier": "enterprise",
  "rpm": 120,
  "tpm": 1000000
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `tier` | string | Yes | Non-empty, unique | Tier 名稱（作為 PK） |
| `rpm` | integer | Yes | >= -1 (-1 = unlimited) | 每分鐘請求數上限 |
| `tpm` | integer | Yes | >= -1 (-1 = unlimited) | 每分鐘 Token 數上限 |

**Response -- Success (201)**
```json
{
  "data": {
    "tier": "enterprise",
    "rpm": 120,
    "tpm": 1000000,
    "created_at": "2026-03-15T15:00:00Z"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_parameter` | Validation failed | tier 為空、rpm/tpm 非整數或 < -1 |
| 409 | `conflict` | Tier already exists | tier PK 重複 |

---

### 3. 更新 Tier

```
PATCH /admin/rate-limits/tiers/:tier
Authorization: Bearer {admin_jwt}
Content-Type: application/json
```

**Path Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tier` | string | Tier 名稱 |

**Request Body**
```json
{
  "rpm": 80,
  "tpm": 600000
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `rpm` | integer | No | >= -1 | 每分鐘請求數上限 |
| `tpm` | integer | No | >= -1 | 每分鐘 Token 數上限 |

> 至少需提供一個欄位。

**Response -- Success (200)**
```json
{
  "data": {
    "tier": "pro",
    "rpm": 80,
    "tpm": 600000,
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_parameter` | Validation failed | 無更新欄位、rpm/tpm 非整數或 < -1 |
| 404 | `not_found` | Tier not found | 指定 tier 不存在 |

---

### 4. 刪除 Tier

```
DELETE /admin/rate-limits/tiers/:tier
Authorization: Bearer {admin_jwt}
```

**Path Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tier` | string | Tier 名稱 |

**Response -- Success (200)**
```json
{
  "data": {
    "tier": "enterprise",
    "deleted": true
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 404 | `not_found` | Tier not found | 指定 tier 不存在 |
| 409 | `conflict` | Tier in use | 有 api_keys.rate_limit_tier 引用此 tier |

**409 Response Body**
```json
{
  "error": {
    "message": "Cannot delete tier 'pro': 5 API key(s) are still using this tier.",
    "type": "invalid_request_error",
    "code": "conflict"
  }
}
```

---

### 5. 列出所有 Model Override

```
GET /admin/rate-limits/overrides
Authorization: Bearer {admin_jwt}
```

**Query Parameters**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `tier` | string | No | -- | 按 tier 篩選 |

**Response -- Success (200)**
```json
{
  "data": [
    {
      "id": "uuid",
      "tier": "pro",
      "model_tag": "apex-smart",
      "rpm": 10,
      "tpm": 100000,
      "created_at": "2026-03-15T15:00:00Z"
    }
  ]
}
```

---

### 6. 新增 Model Override

```
POST /admin/rate-limits/overrides
Authorization: Bearer {admin_jwt}
Content-Type: application/json
```

**Request Body**
```json
{
  "tier": "pro",
  "model_tag": "apex-smart",
  "rpm": 10,
  "tpm": 100000
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `tier` | string | Yes | 必須為已存在的 tier | 所屬 tier |
| `model_tag` | string | Yes | Non-empty | 模型標籤（如 `apex-smart`） |
| `rpm` | integer | Yes | >= -1 | 該模型每分鐘請求數上限 |
| `tpm` | integer | Yes | >= -1 | 該模型每分鐘 Token 數上限 |

**Response -- Success (201)**
```json
{
  "data": {
    "id": "uuid",
    "tier": "pro",
    "model_tag": "apex-smart",
    "rpm": 10,
    "tpm": 100000,
    "created_at": "2026-03-15T15:00:00Z"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_parameter` | Validation failed | 欄位缺失或格式錯誤 |
| 404 | `not_found` | Tier not found | 指定 tier 不存在 |
| 409 | `conflict` | Override already exists | (tier, model_tag) 重複 |

---

### 7. 更新 Model Override

```
PATCH /admin/rate-limits/overrides/:id
Authorization: Bearer {admin_jwt}
Content-Type: application/json
```

**Path Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | UUID | Override ID |

**Request Body**
```json
{
  "rpm": 15,
  "tpm": 150000
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `rpm` | integer | No | >= -1 | 每分鐘請求數上限 |
| `tpm` | integer | No | >= -1 | 每分鐘 Token 數上限 |

> 至少需提供一個欄位。不允許修改 `tier` 和 `model_tag`（若需變更請刪除後重建）。

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "tier": "pro",
    "model_tag": "apex-smart",
    "rpm": 15,
    "tpm": 150000,
    "created_at": "2026-03-15T15:00:00Z"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_parameter` | Validation failed | 無更新欄位或值不合法 |
| 404 | `not_found` | Override not found | 指定 ID 不存在 |

---

### 8. 刪除 Model Override

```
DELETE /admin/rate-limits/overrides/:id
Authorization: Bearer {admin_jwt}
```

**Path Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | UUID | Override ID |

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "deleted": true
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 404 | `not_found` | Override not found | 指定 ID 不存在 |

---

### 9. 指派用戶 Tier（既有端點，文件化）

```
PATCH /admin/users/:id/rate-limit
Authorization: Bearer {admin_jwt}
Content-Type: application/json
```

**Path Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | UUID | User ID |

**Request Body**
```json
{
  "tier": "pro"
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `tier` | string | Yes | 必須為已存在的 tier | 目標 tier 名稱 |

**Response -- Success (200)**
```json
{
  "data": {
    "user_id": "uuid",
    "updated_keys": 3,
    "tier": "pro"
  }
}
```

> 更新該用戶所有 active API key 的 `rate_limit_tier` 欄位。

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_plan` | Invalid tier | 指定 tier 不存在於 rate_limit_tiers 表 |

---

## Shared Error Codes

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 401 | `invalid_token` | Not authenticated or JWT expired |
| 403 | `admin_required` | Not an admin |
| 500 | `internal_error` | Internal server error |

---

## Notes

- 所有端點需 `adminAuth` middleware 保護。
- Tier 的 `tier` 欄位為 PK（TEXT），建立後不可更改名稱。
- Model Override 的 `(tier, model_tag)` 有 UNIQUE 約束。
- 刪除 Tier 時會檢查 `api_keys` 表是否仍有引用，有則回傳 409。
- 刪除 Tier 時會連帶刪除其所有 Model Override（CASCADE）。
- `rpm = -1` 和 `tpm = -1` 表示無限制。
