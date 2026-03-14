# S5 Code Review 報告：apiex-platform

> 本文件由 S5 Code Review 自動產出，記錄對 S4 實作的完整對抗式審查結果與修正軌跡。

## 審查摘要

| 項目 | 內容 |
|------|------|
| 審查模式 | Full Spec 對抗式審查（R1→R2→R3） |
| 審查範圍 | Full（104 個檔案，16,100 行新增） |
| R1 引擎 | Opus (claude-opus-4-6) — Codex skill 未安裝，自動 fallback |
| R2 Agent | reviewer (opus) |
| R3 裁決 | general-purpose (sonnet) |
| 結論 | **fix_required** |
| 分數 | 3/5 |
| S4↔S5 迴圈 | 0 次（首次審查） |
| 審查日期 | 2026-03-14 |

---

## 審查檔案清單

> Full Diff 涵蓋所有 S4 實作檔案（T01~T19），以下列出核心來源檔案。

| # | 檔案路徑 | 變更類型 |
|---|---------|---------|
| 1 | `packages/api-server/src/index.ts` | added |
| 2 | `packages/api-server/src/routes/proxy.ts` | added |
| 3 | `packages/api-server/src/routes/auth.ts` | added |
| 4 | `packages/api-server/src/routes/keys.ts` | added |
| 5 | `packages/api-server/src/routes/admin.ts` | added |
| 6 | `packages/api-server/src/services/KeyService.ts` | added |
| 7 | `packages/api-server/src/services/RouterService.ts` | added |
| 8 | `packages/api-server/src/services/UsageLogger.ts` | added |
| 9 | `packages/api-server/src/adapters/AnthropicAdapter.ts` | added |
| 10 | `packages/api-server/src/adapters/GeminiAdapter.ts` | added |
| 11 | `packages/api-server/src/middleware/apiKeyAuth.ts` | added |
| 12 | `packages/api-server/src/middleware/adminAuth.ts` | added |
| 13 | `packages/api-server/src/lib/errors.ts` | added |
| 14 | `packages/api-server/src/lib/supabase.ts` | added |
| 15 | `packages/cli/src/commands/keys.ts` | added |
| 16 | `packages/cli/src/commands/status.ts` | added |
| 17 | `packages/cli/src/commands/chat.ts` | added |
| 18 | `packages/cli/src/commands/login.ts` | added |
| 19 | `packages/cli/src/lib/api.ts` | added |
| 20 | `packages/mcp-server/src/index.ts` | added |
| 21 | `packages/web-admin/src/lib/api.ts` | added |
| 22 | `packages/web-admin/src/app/admin/login/page.tsx` | added |
| 23 | `packages/web-admin/src/app/admin/(protected)/dashboard/page.tsx` | added |
| 24 | `packages/web-admin/src/app/admin/(protected)/logs/page.tsx` | added |
| 25 | `packages/web-admin/next.config.ts` | added |
| 26 | `supabase/migrations/001_create_tables.sql` | added |
| 27 | `supabase/migrations/002_rls_policies.sql` | added |
| 28 | `supabase/migrations/003_quota_functions.sql` | added |

---

## 問題清單與處置

### 必修項目（阻斷合併）

| # | Finding ID | 問題描述 | R2 回應 | R3 裁決 | 最終嚴重度 |
|---|-----------|---------|---------|---------|-----------|
| 1 | P0-1 | CLI keys list 取 `res.data.keys` 但 API 回傳 `{ data: [...] }` | 接受 | ❌ 維持 | P0 |
| 2 | P0-2 | CLI status 呼叫 `/usage/summary` 但實際路徑為 `/v1/usage/summary` | 接受 | ❌ 維持 | P0 |
| 3 | P0-3 | GeminiAdapter streaming double-parse：RouterService 已 parse，adapter 再 parse 必敗 | 接受 | ❌ 維持 | P0 |
| 4 | P0-4→P1 | 前端送 `per_page` 但後端讀 `limit`，分頁大小不受前端控制 | 接受 | ⚠️ 降為 P1 | P1 |
| 5 | P0-5→P1 | Admin quota validation 用 `Errors.unsupportedModel`，error code 語義錯誤 | 部分接受 | ⚠️ 降為 P1 | P1 |
| 6 | P1-1 | `next.config.ts` ignoreBuildErrors + ignoreDuringBuilds 隱藏錯誤 | 部分接受 | ❌ 維持 P1 | P1 |
| 7 | P1-2 | `settleQuota/logUsage .catch(() => {})` 完全靜默吞錯誤 | 接受 | ❌ 維持 P1 | P1 |
| 8 | P1-5 | `/usage/summary` 未實作 `period` 參數，與 API Spec 不符 | 接受 | ❌ 維持 P1 | P1 |
| 9 | P1-6 | `/usage/summary` 回應格式與 Spec 不一致（缺 data wrapper/quota_remaining/breakdown） | 接受 | ❌ 維持 P1 | P1 |
| 10 | SC-API-7 | `/usage/summary` API 契約不一致（Spec 對照驗證） | — | — | P1 |

### 建議項目（強烈建議但不阻斷）

| # | Finding ID | 問題描述 | R2 回應 | R3 裁決 | 最終嚴重度 |
|---|-----------|---------|---------|---------|-----------|
| 1 | P1-4 | SSE 解析 JSON parse 錯誤靜默跳過 | 部分接受 | ⚠️ 降為 P2 | P2 |
| 2 | P1-7→P2 | auth.ts expires_at 硬編碼 3600 | 部分接受 | ⚠️ 降為 P2 | P2 |
| 3 | P2-1 | errors.ts unsupportedModel 硬編碼模型列表 | — | — | P2 |
| 4 | P2-2 | MCP Server 重複實作 apiRequest | — | — | P2 |
| 5 | P2-3 | Dashboard useCallback 缺少依賴 | — | — | P2 |
| 6 | P2-4 | fly.toml 記憶體設定偏低 | — | — | P2 |

### 駁回項目

| # | Finding ID | 原始問題 | R2 反駁理由 | R3 裁決 |
|---|-----------|---------|------------|---------|
| 1 | P1-3 | settle_quota SQL 函數無交易鎖 | PostgreSQL `UPDATE col=col+val` 本身是原子操作，不需要額外 `FOR UPDATE` | ✅ 接受 R2 反駁 |

---

## 問題統計

| 分類 | R1 提出 | R3 維持 | R3 調整/駁回 |
|------|--------|--------|-------------|
| P0 | 5 | 3 | 2（降為 P1） |
| P1 (blocking) | 7 | 6 (+1 SC) | 1（駁回） |
| P2 | 4 | 4 (+2 降級) | 0 |
| **合計** | **16** | **16** | **3** |

---

## 程式碼修正摘要

> conclusion 為 fix_required，修正將在 S4 迴圈中執行。

| # | 檔案 | 修正描述 | 對應問題 |
|---|------|---------|---------|
| — | 待 S4 修復 | — | — |

---

## S4↔S5 迴圈修復歷史

> 首次審查，無迴圈。

| 迴圈 # | 觸發問題 | 修復內容 | 結果 | 時間 |
|--------|---------|---------|------|------|
| — | — | — | — | — |

---

## Spec 對照驗證

### S0 成功標準

| # | 成功標準 | 是否達成 | 證據 |
|---|---------|---------|------|
| SC-S0-1 | OpenAI SDK 零改動可呼叫成功 | ⚠️ 部分 | proxy.ts 實作 /v1/chat/completions，但 GeminiAdapter streaming 有 P0-3 bug |
| SC-S0-2 | apex-smart / apex-cheap 路由到正確上游模型 | ✅ 是 | RouterService.resolveRoute() 查詢 route_config |
| SC-S0-3 | Streaming 格式與 OpenAI 完全相容 | ⚠️ 部分 | AnthropicAdapter 正確，GeminiAdapter 有型別 bug |
| SC-S0-4 | 上游 timeout 回傳 502 | ✅ 是 | RouterService.ts:154-155 AbortError → 502 |
| SC-S0-5 | 額度為 0 回傳 402 | ✅ 是 | proxy.ts:52-53 → InsufficientQuotaError → 402 |
| SC-S0-6 | 所有請求寫入 usage_logs | ⚠️ 部分 | 成功+錯誤都有 logUsage，但 .catch(() => {}) 可能靜默失敗 |

### S1 影響範圍

| 層 | S1 預期檔案 | S4 實際變更 | 一致？ |
|---|-----------|-----------|-------|
| Frontend | 6 檔 | 13 檔 | ⚠️ 有差異（新增 layout/middleware/api client 等支援檔案，合理 scope creep） |
| Backend | 11 檔 + 3 packages | 15 檔 + 3 packages | ⚠️ 有差異（新增 database.types/adapters types 等支援檔案，合理） |
| Database | 4 新表 + 1 既有 | 4 新表 + 1 既有 + 2 SQL functions | ✅ 核心一致 |

### API 契約一致性

| # | 端點 | 狀態 | 問題 |
|---|------|------|------|
| SC-API-1 | POST /v1/chat/completions | ⚠️ | Gemini streaming 壞掉 |
| SC-API-2 | GET /v1/models | ✅ | 格式正確 |
| SC-API-3 | POST /auth/login | ✅ | 正確實作 |
| SC-API-4 | GET /keys | ✅ | 正確回傳 { data: [...] } |
| SC-API-5 | POST /keys | ✅ | 正確回傳 201 + warning |
| SC-API-6 | DELETE /keys/:id | ✅ | 正確實作 |
| SC-API-7 | GET /usage/summary | ❌ | 回應格式不符 Spec + 缺 period |
| SC-API-8 | GET /admin/users | ✅ | 正確實作 |
| SC-API-9 | PATCH /admin/users/:id/quota | ⚠️ | 功能正確但 error factory 語義錯誤 |
| SC-API-10 | GET /admin/usage-logs | ⚠️ | 功能正確但 per_page/limit 參數不匹配 |

---

## 審查軌跡

| Round | 引擎/Agent | 關鍵結果 |
|-------|-----------|---------|
| R1 挑戰 | Opus (claude-opus-4-6) — Codex fallback | 提出 16 個問題（P0:5 P1:7 P2:4） |
| R2 防禦 | reviewer (opus) | 接受 7、部分接受 4、反駁 1 |
| R3 裁決 | general-purpose (sonnet) | P0→3、P1→7、P2→6、Dismissed→1。結論：**fix_required** |
