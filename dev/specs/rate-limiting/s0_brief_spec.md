# S0 Brief Spec: API Rate Limiting

> **階段**: S0 需求討論
> **建立時間**: 2026-03-15 04:30
> **Agent**: requirement-analyst
> **Spec Mode**: Full Spec
> **工作類型**: new_feature

---

## 0. 工作類型

**本次工作類型**：`new_feature`（R9 風險修復 — Proxy 無 rate limiting）

## 1. 一句話描述

為 Apiex API Proxy 加入 per-key rate limiting（RPM/TPM），超過限制回傳 429 Too Many Requests（OpenAI 相容格式），Admin 可設定 per-user rate limit tier。

## 2. 為什麼要做

### 2.1 痛點

- **無保護**：目前 Proxy 完全沒有 rate limit，單一用戶可以無限打上游 API
- **成本失控**：惡意或失控的 client 可能在短時間內耗盡大量上游額度
- **公平性**：沒有機制保證多用戶之間的公平使用
- **生產必備**：R9 風險在 S1 已識別，是上線前的必要功能

### 2.2 目標

- 每個 API Key 有 RPM（requests per minute）和 TPM（tokens per minute）限制
- 超過限制回傳 429 + retry-after header
- Admin 可設定不同 tier（free/pro），不同 tier 有不同限制
- Rate limit 狀態透過 response headers 暴露（X-RateLimit-*）

## 3. 使用者

| 角色 | 說明 |
|------|------|
| API 使用者 | 透過 API Key 呼叫 /v1/chat/completions，受 rate limit 約束 |
| Admin | 在 Admin UI 設定用戶的 rate limit tier |

## 4. 核心流程

### 4.0 功能區拆解

#### 功能區識別表

| FA ID | 功能區名稱 | 一句話描述 | 入口 | 獨立性 |
|-------|-----------|-----------|------|--------|
| FA-RL1 | Rate Limit 檢查與攔截 | 每次 API 請求前檢查 RPM/TPM，超過則 429 | Proxy middleware | 高 |
| FA-RL2 | Rate Limit 設定管理 | Admin 設定 per-user tier，定義 RPM/TPM 上限 | Admin API + UI | 中 |

**本次策略**：`single_sop_fa_labeled`

### 4.2 FA-RL1: Rate Limit 檢查與攔截

API 請求進入 → apiKeyAuth 驗證 → **rateLimitMiddleware 檢查** → 若未超過：放行 + 記錄計數 → 若超過：回傳 429。

rate limit 使用 **sliding window counter**（記憶體內 Map，per-key 追蹤最近 60 秒的請求數和 token 數）。

Response Headers（每次請求都回傳）：
- `X-RateLimit-Limit-Requests`: RPM 上限
- `X-RateLimit-Limit-Tokens`: TPM 上限
- `X-RateLimit-Remaining-Requests`: 剩餘 RPM
- `X-RateLimit-Remaining-Tokens`: 剩餘 TPM
- `Retry-After`: 秒數（僅 429 時）

### 4.3 FA-RL2: Rate Limit 設定管理

預設 tier：
| Tier | RPM | TPM |
|------|-----|-----|
| free | 20 | 100,000 |
| pro | 60 | 500,000 |
| unlimited | -1 | -1 |

Admin API：PATCH /admin/users/:id/rate-limit { tier: "pro" }
Admin UI：在用戶管理頁新增 tier 選擇下拉選單。

### 4.5 六維度例外清單

| 維度 | ID | FA | 情境 | 觸發條件 | 預期行為 | 嚴重度 |
|------|-----|-----|------|---------|---------|--------|
| 並行/競爭 | E1 | FA-RL1 | 高併發請求同時到達 | burst traffic | 原子性計數器，不漏算 | P1 |
| 狀態轉換 | E2 | FA-RL2 | Admin 即時更改 tier | tier 變更 | 下一分鐘生效 | P2 |
| 資料邊界 | E3 | FA-RL1 | TPM 計算在 streaming 時未知 | stream=true | 預估 max_tokens 預扣，完成後結算 | P1 |
| 網路/外部 | E4 | FA-RL1 | 伺服器重啟 | process restart | 計數器歸零（可接受，重啟是罕見事件） | P2 |
| 業務邏輯 | E5 | FA-RL1 | unlimited tier 不受限 | tier=-1 | 跳過 rate limit 檢查 | P0 |
| UI/體驗 | E6 | FA-RL1 | 429 回應格式 | 超過限制 | OpenAI 相容 error format + retry-after | P0 |

## 5. 成功標準

| # | FA | 類別 | 標準 | 驗證方式 |
|---|-----|------|------|---------|
| 1 | FA-RL1 | 功能 | 超過 RPM 限制時回傳 429 + retry-after header | 單元測試 |
| 2 | FA-RL1 | 功能 | 超過 TPM 限制時回傳 429 | 單元測試 |
| 3 | FA-RL1 | 功能 | 未超過限制時正常放行 + X-RateLimit-* headers | 單元測試 |
| 4 | FA-RL1 | 功能 | unlimited tier 不受限 | 單元測試 |
| 5 | FA-RL2 | 功能 | Admin 可設定用戶 rate limit tier | API 測試 |
| 6 | FA-RL1 | 相容 | 429 回應格式與 OpenAI 完全相容 | 格式驗證 |

## 6. 範圍

### 範圍內
- **FA-RL1**: Rate limit middleware（in-memory sliding window）
- **FA-RL1**: 429 回應 + OpenAI 相容格式 + retry-after
- **FA-RL1**: X-RateLimit-* response headers
- **FA-RL2**: rate_limit_tiers DB 表 + per-user tier 設定
- **FA-RL2**: PATCH /admin/users/:id/rate-limit API
- **FA-RL2**: Admin UI tier 選擇下拉選單

### 範圍外
- 分散式 rate limiting（Redis / 多節點共享）
- per-endpoint 差異化限制
- 自適應 rate limiting（根據上游回應動態調整）
- Rate limit dashboard / analytics
- Burst allowance（突發容忍）

## 7. 已知限制與約束

- In-memory 計數器，伺服器重啟後歸零（MVP 可接受）
- 單節點部署假設（Fly.io 單實例）
- Streaming 請求的 TPM 以 max_tokens 預估
- Tier 設定存 DB，但運行時的計數器在記憶體

## 8. 前端 UI 畫面清單

### 8.1 FA-RL2: Rate Limit 設定畫面

| # | 畫面 | 狀態 | 既有檔案 | 變更說明 |
|---|------|------|---------|---------|
| 1 | **用戶管理頁** | 既有修改 | `dashboard/page.tsx` | 新增 tier 下拉選單欄位 |

### 8.4 畫面統計摘要

| 類別 | 數量 |
|------|------|
| 新增畫面 | 0 |
| 既有修改畫面 | 1（Dashboard tier 選擇） |
