# API Spec: Admin Model Route Management

> **Source**: Extracted from `s1_dev_spec.md` Section 4.1
> **Purpose**: Shared API contract between frontend and backend -- single source of truth
> **Created**: 2026-03-15 10:00

---

## Overview

Admin CRUD endpoints for `route_config` table management (list, create, update). No DELETE endpoint -- deactivation via PATCH `is_active: false`.

**Base URL**: `/admin/models`
**Authentication**: Bearer JWT (Admin role required, via `adminAuth` middleware)

---

## Endpoints

### 1. List All Route Configs

```
GET /admin/models
Authorization: Bearer <admin_jwt>
```

**Parameters**

| Name | Location | Type | Required | Default | Description |
|------|----------|------|----------|---------|-------------|
| `include_inactive` | query | string | No | `true` | Set to `false` to only show active routes |

**Response -- Success (200)**
```json
{
  "data": [
    {
      "id": "uuid",
      "tag": "apex-smart",
      "upstream_provider": "anthropic",
      "upstream_model": "claude-opus-4-6",
      "upstream_base_url": "https://api.anthropic.com",
      "is_active": true,
      "updated_at": "2026-03-15T00:00:00.000Z"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | RouteConfig[] | Array of route config records |
| `data[].id` | string (UUID) | Record ID |
| `data[].tag` | string | Model tag (e.g. `apex-smart`) |
| `data[].upstream_provider` | string | Provider name (e.g. `anthropic`, `google`) |
| `data[].upstream_model` | string | Upstream model identifier |
| `data[].upstream_base_url` | string | Provider base URL |
| `data[].is_active` | boolean | Whether this route is active |
| `data[].updated_at` | string (ISO8601) | Last update timestamp |

---

### 2. Create Route Config

```
POST /admin/models
Authorization: Bearer <admin_jwt>
Content-Type: application/json
```

**Request Body**
```json
{
  "tag": "apex-smart",
  "upstream_provider": "anthropic",
  "upstream_model": "claude-opus-4-6",
  "upstream_base_url": "https://api.anthropic.com",
  "is_active": true
}
```

| Field | Type | Required | Validation Rules | Description |
|-------|------|----------|-----------------|-------------|
| `tag` | string | Yes | Non-empty, trimmed | Model tag identifier |
| `upstream_provider` | string | Yes | Non-empty | Provider name |
| `upstream_model` | string | Yes | Non-empty | Upstream model identifier |
| `upstream_base_url` | string | Yes | Non-empty, valid URL format | Provider base URL |
| `is_active` | boolean | No | Defaults to `true` | Active status |

**Response -- Success (201)**
```json
{
  "data": {
    "id": "uuid",
    "tag": "apex-smart",
    "upstream_provider": "anthropic",
    "upstream_model": "claude-opus-4-6",
    "upstream_base_url": "https://api.anthropic.com",
    "is_active": true,
    "updated_at": "2026-03-15T00:00:00.000Z"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_parameter` | Required field missing or invalid | tag/provider/model/URL empty |
| 409 | `conflict` | Duplicate active tag | Active route with same tag already exists (unique index) |

---

### 3. Update Route Config

```
PATCH /admin/models/:id
Authorization: Bearer <admin_jwt>
Content-Type: application/json
```

**Parameters**

| Name | Location | Type | Required | Default | Description |
|------|----------|------|----------|---------|-------------|
| `id` | path | string (UUID) | Yes | - | Route config record ID |

**Request Body** (all fields optional, at least one required)
```json
{
  "tag": "apex-smart",
  "upstream_provider": "google",
  "upstream_model": "gemini-2.0-flash",
  "upstream_base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
  "is_active": false
}
```

| Field | Type | Required | Validation Rules | Description |
|-------|------|----------|-----------------|-------------|
| `tag` | string | No | Non-empty if provided | Update tag |
| `upstream_provider` | string | No | Non-empty if provided | Update provider |
| `upstream_model` | string | No | Non-empty if provided | Update model |
| `upstream_base_url` | string | No | Non-empty if provided | Update base URL |
| `is_active` | boolean | No | - | Toggle active status |

**Response -- Success (200)**
```json
{
  "data": {
    "id": "uuid",
    "tag": "apex-smart",
    "upstream_provider": "google",
    "upstream_model": "gemini-2.0-flash",
    "upstream_base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
    "is_active": false,
    "updated_at": "2026-03-15T01:00:00.000Z"
  }
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `invalid_parameter` | No update fields provided | Empty body or all fields undefined |
| 404 | `not_found` | Route config not found | No record with given ID |
| 409 | `conflict` | Duplicate active tag | Updating to active when same tag already active |

---

## Shared Definitions

### RouteConfig DTO

```typescript
interface RouteConfig {
  id: string           // UUID
  tag: string          // e.g. "apex-smart"
  upstream_provider: string  // e.g. "anthropic"
  upstream_model: string     // e.g. "claude-opus-4-6"
  upstream_base_url: string  // e.g. "https://api.anthropic.com"
  is_active: boolean
  updated_at: string   // ISO8601
}
```

### Shared Error Codes

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 401 | `unauthorized` | Not authenticated or session expired |
| 403 | `forbidden` | Not an admin user |
| 500 | `internal_error` | Internal server error |

---

## Notes

- No DELETE endpoint by design (security constraint -- soft delete via `is_active: false`)
- The `route_config` table has a unique partial index `idx_route_config_tag_active ON route_config(tag) WHERE is_active = true`, meaning only one active route per tag is allowed
- PATCH with `is_active: false` is the "deactivation" operation; deactivating a route will immediately cause `RouterService.resolveRoute()` to reject requests for that tag
