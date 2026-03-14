# S2 審查報告：Apiex Platform (MVP)

> 本文件由 S2 Spec Review 自動產出，記錄對 `s1_dev_spec.md` 的完整審查結果與修正軌跡。

## 審查摘要

| 項目 | 內容 |
|------|------|
| 審查模式 | Full Spec 對抗式審查 |
| 引擎 | Opus fallback（Codex 不可用） |
| 結論 | **conditional_pass**（修正後通過） |
| R1 Short-Circuit | 否（P0=3, P1=8, P2=3） |
| 審查日期 | 2026-03-14 |
| R1 挑戰者 | Claude Opus 4.6 |
| R2 防禦者 | architect agent |
| R3 裁決者 | Claude Sonnet 4.6 |

---

## 預審摘要

全新專案，無既有 codebase 可驗證引用。Phase 0 預審跳過。

---

## 問題清單與處置

### P0 問題（設計層）

| # | 問題描述 | R2 回應 | R3 裁決 | 處置 |
|---|---------|---------|---------|------|
| SR-P0-001 | Streaming 額度扣減時序缺陷：deductQuota 在 stream 完成後才執行，並發可超扣 | 接受。引入「樂觀預扣」機制：reserveQuota + settleQuota | ❌ 維持阻斷 → **已修正**。T04/T09/Flow B/Data Flow/AC-6 全面更新 | 已修正 |
| SR-P0-002 | S0 E8 要求 retry 但 S1 不做 | 部分接受。MVP 單 upstream 無備援可 retry，降級為 scope 變更 | ✅ 接受 R2。降級為 scope 標註 | 已標註 |
| SR-P0-003 | S0 Happy Path C「指定 model ID」被靜默移除 | 接受問題存在，但為合理 MVP 範圍縮減 | ✅ 接受 R2。降級為 scope 標註 | 已標註 |

### P1 問題（實作層）

| # | 問題描述 | R2 回應 | R3 裁決 | 處置 |
|---|---------|---------|---------|------|
| SR-P1-001 | Data Flow SQL 缺少 `-1` 無限制判斷 | 接受 | ✅ | 已修正（與 P0-001 合併處理） |
| SR-P1-002 | MCP apiex_chat 的 stream? 參數無效 | 接受 | ✅ | 已移除 stream? 參數 |
| SR-P1-003 | AnthropicAdapter 缺少 message_start 等 event | 接受 | ✅ | T05 DoD 已補充 8 種 event |
| SR-P1-004 | S0 成功標準 #1/#2 無 AC 對應 | 部分接受 | ✅ | 新增 AC-15、AC-16 |
| SR-P1-005 | T10 Auth Route DoD 過於簡略 | 接受 | ✅ | T10 DoD 已擴充 |
| SR-P1-006 | per-key 配額語意矛盾 | 部分接受 | ⚠️ 提高要求 → **已修正**。新增 user_quotas 表 | 已修正 |
| SR-P1-007 | 缺少 proxy rate limiting | 部分接受 | ✅ | 風險 R9 + 技術債新增 |
| SR-P1-008 | E11 JWT 離線驗證未設計 | 部分接受 | ✅ | 技術債標註 |

### P2 建議（改善）

| # | 建議描述 | R2 回應 | R3 裁決 | 是否採納 |
|---|---------|---------|---------|----------|
| SR-P2-001 | T13 頁面與 S0 畫面清單差異 | 接受 | ✅ | 是，已補充頁面整合說明 |
| SR-P2-002 | T19 缺少 web-admin 部署 | 接受 | ✅ | 是，T19 補充 Vercel 部署 |
| SR-P2-003 | route_config 缺少上游 API Key 欄位 | 反駁 | ✅ 接受反駁 | 否，MVP 用環境變數，已在技術債標註 |

---

## s1_dev_spec.md 修正摘要

| 修正項 | 修正前（摘要） | 修正後（摘要） | 對應問題 |
|--------|--------------|--------------|----------|
| 額度管理機制 | checkQuota + deductQuota（後置扣減） | reserveQuota + settleQuota（樂觀預扣） | SR-P0-001 |
| SQL 一致性 | 部分 SQL 缺少 `-1` 判斷 | 全部統一含 `OR quota_tokens = -1` | SR-P1-001 |
| 配額資料模型 | 僅 api_keys.quota_tokens（per-key） | 新增 user_quotas 表 + 新 key 繼承機制 | SR-P1-006 |
| E8 上游 timeout | 無標註 | scope 變更記錄（MVP 不 retry） | SR-P0-002 |
| E13 model ID | 一律 400 | 400 + 提示有效標籤 + scope 標註 | SR-P0-003 |
| MCP stream | apiex_chat 含 stream? 參數 | 移除，一律 non-streaming | SR-P1-002 |
| AnthropicAdapter | 4 種 event | 8 種 event 完整處理表 | SR-P1-003 |
| 驗收標準 | AC-1~AC-14 | AC-1~AC-16 | SR-P1-004 |
| T10 Auth DoD | 3 行 | 完整 request/response/error/session 策略 | SR-P1-005 |
| T19 部署 | 僅 Fly.io api-server | Fly.io + Vercel web-admin | SR-P2-002 |

---

## 完整性評分

| 檢查項目 | 評等 | 備註 |
|---------|------|------|
| 任務清單 & DoD | **A** | 修正後每個任務 DoD 可測試，預扣機制有具體 SQL |
| 驗收標準 | **A** | 修正後 16 條 AC 覆蓋所有 S0 成功標準 |
| 技術決策 | **A** | Hono / Monolith / Supabase 決策理由充分，新增額度模型決策 |
| User/Data Flow | **A** | 修正後 Flow B 和 Data Flow 反映預扣機制 |
| 影響範圍 | **B** | 全新專案，影響範圍即交付物，Vercel 部署補充後完整 |
| 風險評估 | **A** | 修正後 R1~R9 涵蓋 streaming、DB、安全、rate limiting |
| Codebase 一致性 | **A** | 全新專案，命名一致，API contract 統一 |

---

## 審查軌跡

| 階段 | 時間 | 結果 |
|------|------|------|
| Phase 0 預審 | 跳過 | 全新專案，無 codebase 引用可驗證 |
| R1 挑戰 | 2026-03-14 21:15 | P0=3, P1=8, P2=3 → BLOCKED |
| R2 防禦 | 2026-03-14 21:25 | 接受 P0-001，降級 P0-002/003，部分接受多項 P1 |
| R3 裁決 | 2026-03-14 21:35 | conditional_pass → BLOCK-1 + BLOCK-3 需修正 |
| Spec 修正 | 2026-03-14 21:45 | 21 項修正完成 |
| 最終結論 | 2026-03-14 21:50 | **PASS**（修正後） |
