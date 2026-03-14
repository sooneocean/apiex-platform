# S5 Code Review 報告：apiex-platform

> 本文件由 S5 Code Review 自動產出，記錄對 S4 實作的完整對抗式審查結果與修正軌跡。

## 審查摘要

| 項目 | 內容 |
|------|------|
| 審查模式 | Full Spec 對抗式審查（R1→R2→R3） |
| 審查範圍 | Scoped（80+ 個檔案，全部新增） |
| R1 引擎 | Opus (claude-opus-4-6)（Codex 不可用，自動 fallback） |
| R2 Agent | reviewer (opus) |
| R3 裁決 | general-purpose (sonnet) |
| 結論 | **fix_required** |
| 分數 | 2/5 |
| S4↔S5 迴圈 | 0 次 |
| 審查日期 | 2026-03-14 |

---

## 審查檔案清單

> Scoped Diff 涵蓋 S4 實作的所有新增檔案。以下列出核心審查檔案。

| # | 檔案路徑 | 變更類型 |
|---|---------|---------|
| 1 | `packages/api-server/src/routes/proxy.ts` | added |
| 2 | `packages/api-server/src/services/RouterService.ts` | added |
| 3 | `packages/api-server/src/services/KeyService.ts` | added |
| 4 | `packages/api-server/src/adapters/AnthropicAdapter.ts` | added |
| 5 | `packages/api-server/src/adapters/GeminiAdapter.ts` | added |
| 6 | `packages/api-server/src/adapters/types.ts` | added |
| 7 | `packages/api-server/src/services/UsageLogger.ts` | added |
| 8 | `packages/api-server/src/middleware/apiKeyAuth.ts` | added |
| 9 | `packages/api-server/src/middleware/adminAuth.ts` | added |
| 10 | `packages/api-server/src/routes/auth.ts` | added |
| 11 | `packages/api-server/src/routes/keys.ts` | added |
| 12 | `packages/api-server/src/routes/admin.ts` | added |
| 13 | `packages/api-server/src/index.ts` | added |
| 14 | `packages/api-server/src/lib/errors.ts` | added |
| 15 | `packages/api-server/supabase/migrations/20260314000000_init_schema.sql` | added |
| 16 | `packages/api-server/src/__tests__/integration.test.ts` | added |
| 17 | `packages/api-server/src/routes/__tests__/proxy.test.ts` | added |
| 18 | `packages/api-server/src/services/__tests__/RouterService.test.ts` | added |
| 19 | `packages/web-admin/src/app/admin/(protected)/dashboard/page.tsx` | added |
| 20 | `packages/cli/src/commands/chat.ts` | added |

---

## 問題清單與處置

### 必修項目（阻斷合併）

| # | Finding ID | 問題描述 | R2 回應 | R3 裁決 | 處置 |
|---|-----------|---------|---------|---------|------|
| 1 | CR-1 (P0) | Anthropic seed URL `api.anthropic.com/v1` + code 拼接 `/v1/messages` = 重複 `/v1/v1/messages`，apex-smart 全部 404 | 接受 | ❌ 維持 blocking | 需修復 seed data 為 `https://api.anthropic.com` |
| 2 | CR-2 (P0) | GeminiAdapter.transformStreamChunk() 對已 parse 的 object 再做 JSON.parse，SyntaxError 被空 catch 吞掉，apex-cheap streaming 全部無輸出 | 接受 | ❌ 維持 blocking | 需移除多餘 JSON.parse |
| 3 | CR-3 (P1) | Anthropic finish_reason 未映射（end_turn→stop），破壞 OpenAI SDK 相容性 | 接受 | ❌ 維持 blocking | 需加入映射表 |
| 4 | CR-4 (P1) | SQL function reserve_quota/settle_quota/admin_list_users 完全未定義，所有 RPC 呼叫 500 | 接受 | ❌ 維持 blocking | 需在 migration 新增 SQL functions |
| 5 | CR-5 (P1) | usage_logs 表缺 user_id 欄位，admin usage-logs 按用戶篩選 400 | 接受 | ❌ 維持 blocking | 需加 user_id 或用 subquery |
| 6 | CR-6 (P1) | GET /v1/usage/summary 完全忽略 period 參數 | 接受 | ❌ 維持 blocking | 需實作 period 篩選 |

### 建議項目（強烈建議但不阻斷）

| # | Finding ID | 問題描述 | R2 回應 | R3 裁決 | 處置 |
|---|-----------|---------|---------|---------|------|
| 1 | CR-7 (P1) | POST /v1/chat/completions 缺少 messages 必填驗證 | 部分接受 | ⚠️ 維持 recommended | 建議加入 |
| 2 | CR-8 (P1) | Streaming 中斷時 status 永遠 success | 接受 | ⚠️ 維持 recommended | 建議加 error flag |
| 3 | CR-9 (P1) | Admin quota 驗證誤用 unsupportedModel 錯誤 | 接受 | ⚠️ 維持 recommended | 建議用正確 error code |
| 4 | CR-10 (P1) | Admin PATCH quota updated_keys 永遠 0 | 接受 | ⚠️ 維持 recommended | 需加 .select('id') |
| 5 | CR-11 (P1) | Anthropic streaming 缺 finish_reason chunk | 接受 | ⚠️ 維持 recommended | 與 CR-3 同時修 |
| 6 | CR-12 (P2) | /auth/login 回傳假造 expires_at | 部分接受 | ⚠️ 維持 recommended | 低優先 |
| 7 | CR-13 (P2) | Anthropic streaming chunk id 每次不同 | 部分接受 | ⚠️ 維持 recommended | 低優先 |
| 8 | CR-14 (P2) | /usage 掛載空 Hono instance，死碼 | 接受 | ⚠️ 維持 recommended | 移除即可 |
| 9 | CR-15 (P2) | JSON body parse 失敗回 500 而非 400 | 部分接受 | ⚠️ 維持 recommended | 建議加 try-catch |
| 10 | CR-17 (P2) | ADMIN_EMAILS 空值無 startup warning | 接受 | ⚠️ 維持 recommended | 建議加 warning |
| 11 | CR-18 (P2→P1) | SSE 解析空 catch 靜默吞所有錯誤 | 接受（R2 建議升級） | ⚠️ 升級 P1 recommended | 加 console.warn |
| 12 | CR-19 (P2) | listKeys key_hash 排除是無效碼 | 接受 | ⚠️ 維持 recommended | 簡化即可 |
| 13 | CR-20 (P2) | 整合測試覆蓋率極低 | 接受 | ⚠️ 維持 recommended | S6 補測試 |
| 14 | CR-21 (P2) | Dashboard router.push 後 throw 造成 UI 閃爍 | 部分接受 | ⚠️ 維持 recommended | 低優先 |
| 15 | CR-22 (P2) | API Key prefix 只有 1 個隨機字元 | 接受 | ⚠️ 維持 recommended | 建議增加長度 |

### 駁回項目

| # | Finding ID | 原始問題 | R2 反駁理由 | R3 裁決 |
|---|-----------|---------|------------|---------|
| 1 | CR-16 (P2) | GET /v1/models created 欄位每次不同 | SDK 不用此欄位做 cache，純 cosmetic | ✅ dismissed |

---

## 問題統計

| 分類 | R1 提出 | R3 維持 | R3 駁回 |
|------|--------|--------|--------|
| P0 | 2 | 2 | 0 |
| P1 (blocking) | 4 | 4 | 0 |
| P1 (recommended) | 5 | 6（含 CR-18 升級） | 0 |
| P2 | 11 | 9 | 1 |
| **合計** | **22** | **21** | **1** |

---

## 程式碼修正摘要

> 本輪為首次審查，尚無修正。

| # | 檔案 | 修正描述 | 對應問題 |
|---|------|---------|---------|
| - | （尚無修正，需回 S4 修復 6 個 blocking 項目） | - | - |

---

## S4↔S5 迴圈修復歷史

> 首次審查，無迴圈。

| 迴圈 # | 觸發問題 | 修復內容 | 結果 | 時間 |
|--------|---------|---------|------|------|
| - | - | - | - | - |

---

## Spec 對照驗證

### S0 成功標準

| # | 成功標準 | 是否達成 | 證據 |
|---|---------|---------|------|
| 1 | OpenAI SDK 僅替換 base_url 和 api_key，零修改可用 | ❌ 未達成 | CR-1（URL 重複 /v1 → 404）、CR-3（finish_reason 未映射 → SDK 行為異常） |
| 2 | apex-smart / apex-cheap 路由到正確上游模型 | ⚠️ 部分 | resolveRoute 邏輯正確，但 forward URL 拼接錯誤（CR-1）導致實際請求失敗 |
| 3 | Streaming 格式與 OpenAI 完全相容 | ❌ 未達成 | CR-2（Gemini streaming 全部靜默丟棄）、CR-11（Anthropic streaming 缺 finish_reason chunk） |
| 4 | 上游 timeout 回傳 502 | ✅ 達成 | RouterService: NON_STREAM_TIMEOUT=30s, STREAM_TIMEOUT=120s, AbortController |
| 5 | 額度為 0 回傳 402 | ❌ 未達成 | CR-4（reserve_quota SQL function 未定義 → RPC 500） |
| 6 | 所有請求（成功/失敗）均寫入 usage_logs | ⚠️ 部分 | 成功/失敗路徑都有 logUsage 呼叫，但 CR-8 streaming 錯誤誤記 success |

**S0 通過率：1/6 ✅, 2/6 ⚠️, 3/6 ❌**

### S1 影響範圍

| 層 | S1 預期檔案 | S4 實際變更 | 一致？ |
|---|-----------|-----------|-------|
| Frontend | 6 檔 | 14 檔 | ⚠️ 新增 AppLayout, ApiKeyCreateModal, QuotaEditor, UsageLogsTable, UserTable, middleware, types, api — 合理擴展 |
| Backend | 16 檔 | 20 檔 | ⚠️ 新增 adapters/types, database.types, adminAuth 拆分 — 合理擴展 |
| Database | 5 表 | 4 表 + seed | ✅ users 由 Supabase Auth 管理 |

### 任務 DoD 驗證

| Task # | 任務名稱 | 狀態 |
|--------|---------|------|
| T01 | Monorepo 初始化 | ✅ pnpm workspaces 結構正確 |
| T02 | DB Schema + RLS | ⚠️ 表和 RLS 正確，但缺 SQL functions（CR-4） |
| T03 | Hono App 骨架 | ✅ 路由註冊、CORS、error handler 正確 |
| T04 | KeyService | ⚠️ 邏輯正確但依賴未定義的 SQL functions |
| T05 | AnthropicAdapter | ⚠️ 8 種 event 處理完整，但 finish_reason 未映射（CR-3）、streaming chunk id 不穩定（CR-13） |
| T06 | GeminiAdapter | ❌ streaming type mismatch（CR-2）導致 streaming 完全壞掉 |
| T07 | RouterService | ⚠️ 邏輯正確但 Anthropic URL 拼接錯誤（CR-1） |
| T08 | UsageLogger | ✅ fire-and-forget 正確 |
| T09 | Proxy Route | ⚠️ pipeline 完整但缺 messages 驗證（CR-7）、usage/summary 缺 period（CR-6） |
| T10 | Auth Route | ✅ 功能正確 |
| T11 | Keys Route | ✅ CRUD + rate limit 正確 |
| T12 | Admin Route | ⚠️ 缺 SQL function（CR-4）、user_id 欄位（CR-5）、計數錯誤（CR-10） |
| T13 | Admin Web UI | ⚠️ 功能完整但有 UX 閃爍問題（CR-21） |
| T14 | CLI | ✅ 功能正確 |
| T15 | MCP Server | ✅ 工具註冊正確 |
| T16 | Tool Schema JSON | ✅ 格式正確 |
| T17 | SKILL.md | ✅ 內容完整 |
| T18 | Integration Tests | ⚠️ 只有 4 個 negative path test（CR-20） |
| T19 | 部署設定 | ✅ Fly.io + Vercel 配置正確 |

---

## 審查軌跡

| Round | 引擎/Agent | 關鍵結果 |
|-------|-----------|---------|
| R1 挑戰 | Opus (claude-opus-4-6) — Codex fallback | 提出 22 個問題（P0:2 P1:9 P2:11） |
| R2 防禦 | reviewer (opus) | 接受 16、部分接受 5、反駁 0 |
| R3 裁決 | general-purpose (sonnet) | 維持 21、駁回 1（CR-16）。結論：fix_required |
