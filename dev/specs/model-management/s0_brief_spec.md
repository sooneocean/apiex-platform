# S0 Brief Spec — 模型路由管理 Admin UI（FA-E）

> **階段**: S0 需求討論
> **建立時間**: 2026-03-15
> **Agent**: requirement-analyst
> **Spec Mode**: quick
> **Work Type**: new_feature

---

## §1 一句話描述

Admin 可在 Web UI 的 `/admin/settings/routes` 頁面新增、編輯、啟用／停用 `route_config` 路由設定，不再需要直接操作 Supabase DB。

---

## §2 背景與痛點

| # | 痛點 |
|---|------|
| P1 | Admin 必須直接進 Supabase Dashboard 操作 DB 才能管理模型路由，容易誤改資料 |
| P2 | 無 UI 可檢視所有路由狀態（含 inactive），難以掌握整體路由健康度 |
| P3 | 切換 is_active 需要手寫 SQL UPDATE，步驟多、高風險 |

---

## §3 目標

為已存在的 `route_config` 表提供 Admin UI 管理介面，透過現有 `/admin/*` 架構（adminAuth middleware + ADMIN_EMAILS whitelist）完成路由 CRUD 操作。

---

## §4 需求規格

### §4.1 成功標準（驗收條件）

| ID | 條件 | 優先級 |
|----|------|--------|
| AC-1 | Admin 在 `/admin/settings/routes` 可看到所有路由，inactive 路由以灰色標記 | Must |
| AC-2 | Admin 可透過表單新增路由（tag + upstream_provider + upstream_model + upstream_base_url） | Must |
| AC-3 | Admin 可編輯既有路由的任意欄位 | Must |
| AC-4 | Admin 可切換路由 is_active 狀態（toggle） | Must |
| AC-5 | 非 Admin 呼叫路由管理 API 回傳 403 | Must |
| AC-6 | 停用唯一 active 路由時，UI 顯示警告提示（仍允許操作） | Should |

### §4.2 範圍

**Scope In**

| 類型 | 項目 |
|------|------|
| API | `GET /admin/routes` — 列出所有 route_config（含 inactive），回傳完整欄位 |
| API | `POST /admin/routes` — 新增路由，必填：tag, upstream_provider, upstream_model, upstream_base_url |
| API | `PATCH /admin/routes/:id` — 部分更新路由欄位 |
| API | `PATCH /admin/routes/:id/toggle` — 切換 is_active，last active 路由時回傳 warning |
| UI | `/admin/settings/routes` 頁面 — 路由列表 + 新增／編輯表單（modal 或 inline） |
| UI | `AppLayout.tsx` navItems 新增「Settings: Routes」 |

**Scope Out**

- `route_config` 表結構變更（現有欄位已足夠，不新增 migration）
- 路由健康檢查、延遲測試
- 路由優先級、權重管理
- 批次操作（批次啟用／停用）
- 刪除路由（停用即可，保留資料）

### §4.3 六維度例外清單

| ID | 維度 | 情境 | 處理方式 |
|----|------|------|---------|
| E1 | 並行／競爭 | 兩個 Admin 同時 PATCH 同一路由 | Last write wins（DB 層 `updated_at` 覆蓋）。不加分散式鎖，acceptable |
| E2 | 資料邊界 | 新增路由時 tag 已存在於 active 路由 | DB unique index `idx_route_config_tag_active` 攔截；API 回傳 409 Conflict + 明確錯誤訊息 |
| E3 | 資料邊界 | 必填欄位（tag / upstream_model 等）為空或格式錯誤 | API 層驗證，回傳 400 Bad Request + 欄位明細；前端表單同步驗證 |
| E4 | 業務邏輯 | 停用唯一 active 路由（proxy 將 503） | 允許操作；toggle 前計算 active 路由數，若 = 1 則回傳 `{ warning: "last_active_route" }`；UI 顯示確認提示後執行 |
| E5 | 網路／外部 | API 請求失敗（網路中斷、5xx） | UI 顯示錯誤訊息，不清空表單，允許重試 |
| E6 | UI／體驗 | 表單送出中途切換頁面 | 無特殊保護（quick spec，不在 must scope） |

---

## §5 技術約束

| 約束 | 說明 |
|------|------|
| Auth | 使用現有 `adminAuth` middleware，ADMIN_EMAILS whitelist 已有，不需新增 |
| DB | 透過 `supabaseAdmin` client（service role）操作 `route_config` 表 |
| 後端 | Hono，新 handler 加入 `adminRoutes()` function（`packages/api-server/src/routes/admin.ts`） |
| 前端 | Next.js App Router，路徑 `/admin/settings/routes/`；沿用 AppLayout + Tailwind |
| Migration | 不新增，現有 schema 已足夠 |

---

## §6 現有程式碼關鍵路徑

| 檔案 | 變更類型 | 說明 |
|------|---------|------|
| `packages/api-server/src/routes/admin.ts` | 修改（新增 handlers） | 加入 routes CRUD endpoints |
| `packages/web-admin/src/components/AppLayout.tsx` | 修改 | `navItems` 新增 `{ href: '/admin/settings/routes', label: 'Settings: Routes' }` |
| `packages/web-admin/src/app/admin/settings/routes/page.tsx` | 新增 | 路由管理頁面 |

---

## §7 API 合約草稿

```
GET    /admin/routes
  Response 200: { data: RouteConfig[] }

POST   /admin/routes
  Body:     { tag: string, upstream_provider: string, upstream_model: string, upstream_base_url: string }
  Response 201: { data: RouteConfig }
  Errors:   400 (缺必填欄位), 409 (tag 衝突)

PATCH  /admin/routes/:id
  Body:     Partial<{ tag, upstream_provider, upstream_model, upstream_base_url }>
  Response 200: { data: RouteConfig }
  Errors:   400, 404, 409

PATCH  /admin/routes/:id/toggle
  Body:     (none)
  Response 200: { data: RouteConfig, warning?: "last_active_route" }
  Errors:   404
```

RouteConfig 型別：
```typescript
interface RouteConfig {
  id: string            // UUID
  tag: string
  upstream_provider: string
  upstream_model: string
  upstream_base_url: string
  is_active: boolean
  updated_at: string    // ISO 8601
}
```

---

## §8 不確定項目

無。需求完整，可直接進入 S1。
