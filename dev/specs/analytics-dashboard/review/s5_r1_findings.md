# S5 R1 Code Review Findings — Analytics Dashboard (FA-D)

> **R1 挑戰者審查**
> **審查日期**: 2026-03-15
> **審查範圍**: Analytics Dashboard 完整 S4 實作（後端 + 前端 + Migration）
> **Spec 基準**: `s1_api_spec.md` + `s1_dev_spec.md`

---

## Findings

---

### CR-1
- **Severity**: P0
- **File**: `packages/api-server/src/services/AggregationService.ts` (全域)
- **Title**: Supabase JS client 預設 1000 行限制導致大量資料聚合結果靜默截斷

**Description**:
AggregationService 中所有使用 `supabaseAdmin.from('usage_logs').select(...)` 的查詢都沒有設定 `.limit()` 或分頁機制。Supabase PostgREST 預設回傳上限為 1000 行（由伺服器端 `max-rows` 配置控制，預設值通常為 1000）。

這意味著：
- `getTimeseries()` (Line 196-206)：當 30 天內 usage_logs 超過 1000 筆時，JS 端聚合只會處理前 1000 筆，**聚合結果靜默不完整**，用戶看到的 token 用量會偏低。
- `getModelBreakdown()` (Line 278-287)：同上。
- `getLatencyTimeseries()` (Line 338-349)：延遲百分位計算基於不完整資料，p95/p99 數字不可信。
- `getOverview()` (Line 542-546)：全平台統計截斷。
- `getTopUsers()` (Line 626-633)：用戶排行不完整。
- `getBillingSummary()` (Line 419-425)：帳單費用計算不完整。

**Evidence**:
dev_spec 明確設計了 8 個 PostgreSQL RPC functions（migration SQL 中已建立），專門用 SQL 端 GROUP BY + SUM 做聚合，就是為了避免這個問題。但 AggregationService 的實際實作完全沒有使用這些 RPC functions，而是自己 fetch raw rows + JS 端聚合。

Migration SQL 裡有 `analytics_timeseries()`, `analytics_model_breakdown()`, `analytics_latency_percentile()`, `analytics_billing_summary()`, `analytics_platform_overview()`, `analytics_platform_timeseries()`, `analytics_top_users()`, `analytics_platform_latency()` 共 8 個 stored functions，全部 `SET LOCAL statement_timeout = '10s'`，全部沒有被呼叫。

**Recommendation**:
AggregationService 必須改用 `supabaseAdmin.rpc()` 呼叫已建立的 RPC functions，這同時解決：(1) 1000 行截斷、(2) SQL 端聚合效能、(3) 10 秒 statement_timeout。這是 dev_spec 原始設計方案（Section 1.2），實作偏離了 spec。

---

### CR-2
- **Severity**: P0
- **File**: `packages/api-server/src/routes/analytics.ts` + `packages/api-server/src/routes/admin.ts`
- **Title**: 所有聚合 API 缺少 504 Gateway Timeout 錯誤處理

**Description**:
api_spec 明確定義所有聚合查詢設定 10 秒 statement timeout，超時回傳 HTTP 504 `gateway_timeout`。`errors.ts` 中已實作 `Errors.gatewayTimeout()` (Line 142-143)。

但 analytics.ts 和 admin.ts 的所有 catch block 都只呼叫 `Errors.internalError()`（500），沒有任何 timeout 偵測邏輯。

**Evidence**:
- `analytics.ts` Line 47: `return Errors.internalError()`
- `analytics.ts` Line 75, 103, 122: 同上
- `admin.ts` Line 239, 258, 277: 同上

api_spec Error Codes 表格：
> | 504 | `gateway_timeout` | 聚合查詢超過 10 秒 timeout |

dev_spec Section 3.3 E7/E8：
> 後端 504 → 前端「查詢超時，請縮短時間範圍」

**Recommendation**:
由於 CR-1 的存在（未使用 RPC），目前根本不會觸發 PostgreSQL statement_timeout。但即使修正 CR-1 改用 RPC 後，catch block 仍需偵測 timeout error 並回傳 `Errors.gatewayTimeout()` 而非 `Errors.internalError()`。

建議 catch block 檢查 error message 包含 `statement timeout` 或 `canceling statement due to statement timeout` 時回傳 504。

---

### CR-3
- **Severity**: P1
- **File**: `packages/api-server/src/routes/analytics.ts:111-124`
- **Title**: Billing endpoint 對 invalid period 不回傳 400，靜默降級為 '30d'

**Description**:
api_spec Endpoint #5 的 period 驗證規則與其他 endpoint 一致：不合法值應回傳 400。但 billing route 的實作：

```typescript
const period = validatePeriod(periodRaw) ?? '30d'
```

當 `validatePeriod` 回傳 `null`（不合法 period），不是回傳 400 錯誤，而是靜默降級為 `'30d'`。其他三個 analytics endpoint 都正確回傳 400。

**Evidence**:
- `analytics.ts` Line 115: `const period = validatePeriod(periodRaw) ?? '30d'`
- 對比 Line 31-33 (timeseries): `if (!period) return Errors.invalidParam(...)`

**Recommendation**:
改為與其他 endpoint 一致：
```typescript
const period = validatePeriod(periodRaw)
if (!period) return Errors.invalidParam('period must be one of: 24h, 7d, 30d')
```
billing 的預設 period 應在 `validatePeriod` 的 fallback 處理（當 `raw` 為 undefined 時），而不是在 null coalescing。`validatePeriod` 已正確處理 `!raw` 回傳 `'7d'`，但 billing spec 預設為 `'30d'`。可改 billing 專用 validatePeriod 或直接 `if (!periodRaw) period = '30d'`。

---

### CR-4
- **Severity**: P1
- **File**: `packages/api-server/src/services/AggregationService.ts:440-472`
- **Title**: Billing 費率邏輯 — 任一 model 缺費率就整個 cost 變 null，與 spec 語義不完全對齊

**Description**:
api_spec 描述：
> 費率未設定行為：若 `model_rates` 無對應 model 的費率記錄，`cost` 回傳 `null`。

AggregationService Line 441-477 的邏輯：若「任一」model 缺 rate (`hasMissingRate = true`)，整個 cost 物件為 null，包括已有 rate 的 model 的費用也不顯示。

此行為在用戶使用多個 model、但只有部分 model 有設定費率時，會導致完全看不到任何費用資訊。spec 的語義有模糊空間，但 `continue` (Line 451) + `hasMissingRate = true` 的組合意味著有 rate 的 model 的 breakdownItems 已經正確計算但最終被丟棄。

**Evidence**:
Line 449-451:
```typescript
if (!rate) {
  hasMissingRate = true
  continue
}
```
Line 471-477: `modelUsage.size === 0 || hasMissingRate ? null : { ... }`

**Recommendation**:
考慮改為：有 rate 的 model 正常顯示在 breakdown 中，缺 rate 的 model 標記為 `rate: null` 或不納入 total。讓用戶至少看到部分費用資訊而非全部為 null。此為 P1 因為是 spec 語義模糊區，非直接 bug。

---

### CR-5
- **Severity**: P1
- **File**: `packages/api-server/src/services/AggregationService.ts:684-693`
- **Title**: getTopUsers 逐一呼叫 auth.admin.getUserById 造成 N+1 效能問題

**Description**:
`getTopUsers` 取得排行後，用 `for` 迴圈逐一呼叫 `supabaseAdmin.auth.admin.getUserById(uid)` 取 email（Line 684-693）。Top 50 用戶就是 50 次 sequential HTTP 請求。

**Evidence**:
```typescript
for (const uid of userIds) {
  try {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid)
    ...
```

migration SQL 的 `analytics_top_users` RPC function 直接 `JOIN auth.users au ON au.id = uc.user_id` 一次性取得 email，效率遠高於此。

**Recommendation**:
改用 `supabaseAdmin.auth.admin.listUsers()` 配合 filter，或直接使用 RPC function（與 CR-1 一併修正）。RPC function 已正確實作 JOIN auth.users 取 email。

---

### CR-6
- **Severity**: P1
- **File**: `packages/api-server/src/services/AggregationService.ts:445-447`
- **Title**: getBillingSummary 使用最新 usage timestamp 取費率，而非 per-record 歷史費率

**Description**:
api_spec 定義費率查詢規則：
> 歷史費率查詢：取 `model_rates` 中 `model_tag = ? AND effective_from <= usage.created_at` 的最新一筆

但實際實作是將每個 model 的所有 usage 匯總後，只用「最新一筆 usage 的 timestamp」去查費率。這意味著如果費率在期間中途變更，所有 usage 都按最新費率計算，而非按各自發生時間的歷史費率計算。

**Evidence**:
Line 446: `const latestTimestamp = usage.timestamps.sort().pop() ?? new Date().toISOString()`
Line 447: `const rate = await this.ratesService.getEffectiveRate(model_tag, latestTimestamp)`

Migration SQL `analytics_billing_summary` 的 `effective_rates` CTE 也有類似簡化（DISTINCT ON model_tag 取最新），所以 RPC 和 JS 實作的語義是一致的。但兩者都與 api_spec 的定義不符。

**Recommendation**:
如果產品接受「使用最新費率計算」的簡化方案，應在 api_spec 修正描述。如果要嚴格遵守歷史費率，需要 per-record 或 per-bucket 查費率（效能考量可用 LATERAL JOIN）。

此問題為「spec 與實作的已知偏差」，P1 因為帳單金額可能不準確。

---

### CR-7
- **Severity**: P1
- **File**: `packages/web-admin/src/app/portal/dashboard/page.tsx:359`
- **Title**: 前端 topup amount_usd 重複除以 100

**Description**:
api_spec 明確記載：
> `topup_logs.amount_usd` 為 INTEGER（單位：美分），前端顯示時需除以 100

但 AggregationService.getBillingSummary（Line 508-520）回傳的 `recent_topups` 直接從 DB 讀取 `amount_usd`，**不做除法**。

前端 `page.tsx` Line 359 做了 `t.amount_usd / 100`。

然而 migration SQL 的 `analytics_billing_summary` RPC function 的 `recent_topup_data` CTE 已經做了 `(amount_usd::NUMERIC / 100) AS amount_usd`（Line 332）。

目前因為 CR-1（JS 端聚合，未用 RPC），前端 `/100` 是正確的。但如果修正 CR-1 改用 RPC，就會**重複除以 100**，金額顯示為實際的 1/100。

**Evidence**:
- AggregationService Line 515: `amount_usd: t.amount_usd`（raw cents from DB）
- Portal Dashboard Line 359: `${(t.amount_usd / 100).toFixed(2)}`（前端除 100）
- Migration RPC Line 332: `(amount_usd::NUMERIC / 100) AS amount_usd`（RPC 也除 100）

**Recommendation**:
統一語義。選項一：RPC 回傳美分，前端除 100。選項二：RPC 回傳美元，前端直接顯示。需在修正 CR-1 時一併處理，否則必出 bug。

---

### CR-8
- **Severity**: P1
- **File**: `packages/web-admin/src/middleware.ts:85-95`
- **Title**: middleware 對每個 /admin/* 請求都呼叫 /auth/me API，效能影響

**Description**:
middleware 在每次 `/admin/*` 頁面請求（Line 85-95）都會呼叫 `fetchIsAdmin(token)` → HTTP 請求到 api-server `/auth/me` → Supabase `getUser()`。每次頁面導航都增加一次 round-trip。

雖然 dev_spec 設計為 client-side AuthContext 做角色判斷（Section 1.2），但 middleware 也做了 server-side 的角色檢查。這造成：(1) 每個 admin 頁面多一次 HTTP 呼叫；(2) 若 api-server 暫時不可用，降級行為是「允許訪問」（Line 93-94），等於 admin 保護失效。

**Evidence**:
Line 88-94:
```typescript
const isAdmin = await fetchIsAdmin(token)
if (isAdmin === false) {
  return NextResponse.redirect(new URL('/portal/dashboard', request.url))
}
// isAdmin === null（呼叫失敗）→ 降級：允許訪問，不阻斷
```

**Recommendation**:
此為 dev_spec 設計的已知 tradeoff（避免 Edge Runtime 延遲但需要 server-side 保護）。建議：(1) 快取 isAdmin 結果到 cookie/session，減少重複呼叫；(2) 對於 `isAdmin === null`（API 不可用）的降級行為，考慮是否應阻斷而非允許。目前的降級策略意味著 api-server 當機時任何登入用戶都能看 admin 頁面。

---

### CR-9
- **Severity**: P2
- **File**: `packages/api-server/src/services/AggregationService.ts:220-223` + `364-370`
- **Title**: JS 端 Date 截斷用本地時區，可能導致 UTC 以外時區的 bucket 對齊錯誤

**Description**:
時間桶截斷使用 JavaScript `Date` 物件的 `setMinutes(0,0,0)` 和 `setHours(0,0,0,0)`，這些方法操作的是**本地時區**而非 UTC。

如果 api-server 的 Node.js 進程時區不是 UTC（例如在 TZ=Asia/Taipei 的環境），`date.setHours(0,0,0,0)` 會截斷到本地午夜而非 UTC 午夜，導致 bucket 邊界與 PostgreSQL `DATE_TRUNC('day', ...)` 不一致。

**Evidence**:
Line 221-222:
```typescript
date.setMinutes(0, 0, 0)  // 本地時區截斷
bucketKey = date.toISOString()
```

應使用 `date.setUTCMinutes(0, 0, 0)` 和 `date.setUTCHours(0, 0, 0, 0)`。

**Recommendation**:
改用 UTC 方法：`date.setUTCMinutes(0, 0, 0)` / `date.setUTCHours(0, 0, 0, 0)`。或更好的方案是直接使用 RPC functions（CR-1），完全避免 JS 端時間處理。

---

### CR-10
- **Severity**: P2
- **File**: `packages/api-server/src/lib/isAdmin.ts:6`
- **Title**: ADMIN_EMAILS 在模組載入時讀取 env，熱更新環境變數不生效

**Description**:
`ADMIN_EMAILS` 是 module-level const（Line 6），只在 import 時解析一次。如果在不重啟 server 的情況下修改 ADMIN_EMAILS 環境變數，不會生效。

**Evidence**:
```typescript
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
```

**Recommendation**:
如果不需要熱更新，這是可接受的行為。如果需要支援動態變更 admin 名單，改為在 `isAdminEmail()` 函式內讀取 `process.env.ADMIN_EMAILS`。P2 因為目前的部署模式（重啟即生效）下不是問題。

---

### CR-11
- **Severity**: P2
- **File**: `packages/api-server/src/routes/admin.ts` (全域)
- **Title**: admin.ts 缺少 Admin Analytics Timeseries endpoint，api_spec 與前端都有定義

**Description**:
前端 `api.ts` Line 415-420 定義了 `getTimeseries` 呼叫 `GET /admin/analytics/timeseries`，但 `admin.ts` 沒有對應路由。api_spec 的 Admin Platform Overview (Endpoint #6) 的 response 包含 `series[]`，前端目前使用 overview 回應中的 `series` 來渲染圖表，所以功能上不受影響。

但如果前端呼叫 `getTimeseries`（目前未呼叫），會得到 404。前端 AdminAnalyticsPage 實際上只用了 overview/latency/top-users 三個 API。

**Evidence**:
- `api.ts` Line 415: `getTimeseries` → `/admin/analytics/timeseries`
- `admin.ts`: 無此路由
- AdminAnalyticsPage Line 83: 只呼叫 `getOverview`, `getLatency`, `getTopUsers`

**Recommendation**:
P2 因為前端未實際呼叫。但 dead code 應清理：要嘛移除 `api.ts` 中的 `getTimeseries`，要嘛在 `admin.ts` 補上路由。Migration SQL 已有 `analytics_platform_timeseries()` RPC function 可用。

---

### CR-12
- **Severity**: P2
- **File**: `packages/api-server/src/services/AggregationService.ts:500-504`
- **Title**: estimated_days_remaining 計算使用 total_quota_tokens 而非 remaining quota

**Description**:
`estimated_days_remaining` 計算為 `total_quota_tokens / daily_avg_consumption`。但 `total_quota_tokens` 是配額上限，不是剩餘配額。正確應為 `(total_quota_tokens - already_consumed) / daily_avg`。

api_spec 欄位定義：
> `data.quota.estimated_days_remaining` | number / null | 預估剩餘天數

「剩餘天數」語義上應基於剩餘可用配額。

**Evidence**:
Line 500-504:
```typescript
const estimated_days_remaining =
  is_unlimited || total_quota_tokens < 0
    ? null
    : daily_avg_consumption > 0
      ? parseFloat((total_quota_tokens / daily_avg_consumption).toFixed(1))
      : null
```

這裡沒有扣除已使用的 tokens。

**Recommendation**:
改為 `(total_quota_tokens - total_consumed_in_period) / daily_avg_consumption`。需要額外查詢用戶已消耗的 total tokens，或利用已有的 usageRows 計算。

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| P0 | 2 | CR-1, CR-2 |
| P1 | 6 | CR-3, CR-4, CR-5, CR-6, CR-7, CR-8 |
| P2 | 4 | CR-9, CR-10, CR-11, CR-12 |
| **Total** | **12** | |

---

## Verdict

**Short-Circuit: 未通過** — 存在 2 個 P0 問題。

**CR-1 (P0)** 是最關鍵的：AggregationService 完全沒有使用 migration 中已建立的 8 個 RPC functions，改用 JS 端聚合，受 Supabase 1000 行預設限制影響，任何有合理使用量的用戶都會看到不完整的數據。且所有 SQL 端的 10 秒 statement_timeout 保護也形同虛設。

**CR-2 (P0)** 與 CR-1 連帶：即使修正為 RPC 呼叫，timeout error 也不會正確回傳 504，而是被 catch 為 500 internal error。

建議 R2 防禦者優先回應 CR-1 和 CR-2 的修正方案。
