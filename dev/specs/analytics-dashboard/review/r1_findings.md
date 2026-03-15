# R1 Spec Review Findings: Analytics Dashboard

> **審查者**: R1 挑戰者 + 預審者（合併角色，單引擎審查）
> **審查時間**: 2026-03-15
> **審查對象**: `s1_dev_spec.md`, `s1_api_spec.md`, `s1_frontend_handoff.md`
> **背景參照**: `s0_brief_spec.md`, `sdd_context.json`

---

## Findings

---

### SR-1
- **Severity**: P0
- **Category**: consistency
- **Description**: dev_spec 與 api_spec 的 endpoint 路徑嚴重不一致。dev_spec Section 4.1 定義用戶 endpoints 為 `/analytics/timeseries`、`/analytics/model-breakdown`、`/analytics/latency`、`/analytics/billing`（4 個短路徑），但 api_spec 定義的路徑是 `/analytics/usage/timeseries`、`/analytics/usage/model-breakdown`、`/analytics/latency/timeseries`、`/analytics/billing/summary`（更長的巢狀路徑）。frontend_handoff 跟的是 api_spec 的路徑。兩份文件定義了不同的 API 契約，實作時必然出現前後端不一致。
- **Evidence**:
  - `s1_dev_spec.md` L241-246：`/analytics/timeseries`, `/analytics/model-breakdown`, `/analytics/latency`, `/analytics/billing`
  - `s1_api_spec.md` L37：`/analytics/usage/timeseries`, L99：`/analytics/usage/model-breakdown`, L156：`/analytics/latency/timeseries`, L207：`/analytics/billing/summary`
  - `s1_frontend_handoff.md` L83-86：使用 api_spec 的路徑
- **Recommendation**: 統一為 api_spec 的路徑（較語義化）。更新 dev_spec Section 4.1 表格、Task #7 描述、所有引用處。同時更新 dev_spec 中的 mermaid sequence diagram。

---

### SR-2
- **Severity**: P0
- **Category**: consistency
- **Description**: dev_spec 與 api_spec 的 Admin analytics endpoint 數量和路徑不一致。dev_spec Section 4.1 列出 3 個 Admin analytics endpoints（overview, latency, top-users），但 api_spec 定義了 4 個（overview, timeseries, users/ranking, latency）。具體差異：(1) api_spec 有 `GET /admin/analytics/timeseries`（Endpoint #6），dev_spec 完全遺漏；(2) dev_spec 寫 `/admin/analytics/top-users`，api_spec 寫 `/admin/analytics/users/ranking`。
- **Evidence**:
  - `s1_dev_spec.md` L247-249：只列 overview, latency, top-users 共 3 個
  - `s1_api_spec.md` L327-431：定義了 overview (5), timeseries (6), users/ranking (7), latency (8) 共 4 個
  - `s1_dev_spec.md` Task #8 L440：「Analytics 3 個 GET：overview, latency, top-users」——缺少 timeseries
  - `s1_frontend_handoff.md` L88：列出 `GET /admin/analytics/timeseries`
- **Recommendation**: dev_spec 必須補上 `GET /admin/analytics/timeseries` endpoint。統一路徑名稱（`/admin/analytics/users/ranking` vs `/admin/analytics/top-users`）。Task #8 DoD 加入 admin timeseries endpoint 的驗收。同步更新 Task #6 和 AggregationService 描述。

---

### SR-3
- **Severity**: P0
- **Category**: consistency
- **Description**: dev_spec 的 model_rates 表結構缺少 `created_by` 欄位，但 s0_brief_spec 和 api_spec 都包含此欄位。s0_brief_spec Section 4.2.1 明確定義 `created_by UUID` 為 Admin user_id。api_spec `GET /admin/rates` 回應（L465）和 `POST /admin/rates` 回應（L513）都包含 `created_by` 欄位。dev_spec Section 4.2 的 CREATE TABLE 語句沒有 `created_by`，Task #1 DoD 也沒有提及。
- **Evidence**:
  - `s0_brief_spec.md` L186：`created_by | uuid | Admin user_id`
  - `s1_api_spec.md` L465：`"created_by": "uuid"` 在 GET /admin/rates 回應中
  - `s1_api_spec.md` L513：`"created_by": "uuid"` 在 POST /admin/rates 回應中
  - `s1_dev_spec.md` L259-269：CREATE TABLE 無 `created_by`
  - `s1_dev_spec.md` L282-296：TypeScript ModelRate interface 無 `created_by`
  - 但 `s1_frontend_handoff.md` L287-296：前端 ModelRate type 有 `created_by: string`
- **Recommendation**: dev_spec 的 model_rates CREATE TABLE 加入 `created_by UUID REFERENCES auth.users(id)`。TypeScript ModelRate interface 加入 `created_by`。Task #1 DoD 加入此欄位。Task #3 RatesService createRate 需接收 adminId 並寫入 created_by。

---

### SR-4
- **Severity**: P1
- **Category**: consistency
- **Description**: dev_spec 聲稱 endpoint 總數為 11 個，但 api_spec 實際定義了 12 個（含 `GET /auth/me`）。若計算 api_spec 中的 Admin analytics endpoints 為 4 個（非 dev_spec 說的 3 個），則不含 /auth/me 也是 11 個。但 api_spec overview Section（L11）自己也說 11 個，實際定義了 11 個 analytics/rates endpoints + /auth/me 沒算在內。dev_spec 的 4.1 表格列了 12 行（含 /auth/me）。計數不一致容易造成交接混亂。
- **Evidence**:
  - `s1_api_spec.md` L11：「新增 11 個 API endpoints：4 個用戶端 analytics、4 個 admin analytics、3 個費率管理」
  - `s1_dev_spec.md` L238-252：表格列出 12 行（含 GET /auth/me）
- **Recommendation**: 明確定義 /auth/me 是否納入計數。建議 api_spec 也納入 /auth/me 的完整規格定義（目前 api_spec 完全沒定義 /auth/me 的 request/response 格式）。

---

### SR-5
- **Severity**: P1
- **Category**: completeness
- **Description**: S0 成功標準 #6「Admin Dashboard 顯示全平台 token 趨勢圖（apex-smart / apex-cheap 分開）」需要 `GET /admin/analytics/timeseries` endpoint，但 dev_spec Task #6（AggregationService: billing + overview + top-users）和 Task #8（Admin analytics + rates 路由）都沒有涵蓋 admin timeseries 的實作。dev_spec 的 Task 清單遺漏了 admin timeseries 的 AggregationService 方法和路由。
- **Evidence**:
  - `s0_brief_spec.md` 成功標準 #6（L461）
  - `s1_dev_spec.md` Task #4（L370-383）：getTimeseries 有提到「支援 per-user 和全平台模式」，但 Task #8（L440）只列 overview, latency, top-users
  - `s1_api_spec.md` Endpoint #6（L327-365）
  - `s1_frontend_handoff.md` L88：前端需要呼叫此 endpoint
- **Recommendation**: 確認 Task #4 的 getTimeseries 已包含全平台模式。Task #8 的描述和 DoD 必須明確加入 `GET /admin/analytics/timeseries` endpoint。

---

### SR-6
- **Severity**: P1
- **Category**: completeness
- **Description**: S0 brief_spec Section 8.1 定義了「帳單頁」（/billing）作為獨立頁面（#2），但 dev_spec 將帳單內容合併進用戶 Dashboard 頁面（Task #13）。dev_spec 完全沒有帳單頁面的獨立 Task。然而 sdd_context.json 的 impact_scope.frontend 仍列出 `portal/billing/page.tsx` 為新增檔案（L203），frontend_handoff Section 5.3 也列出 UserBilling 為 `/portal/billing`（L448），且 frontend_handoff 的 Task 清單有 T14 用戶帳單頁面。dev_spec 與 frontend_handoff / sdd_context 在此不一致。
- **Evidence**:
  - `s0_brief_spec.md` L540-541：帳單頁 `/billing` 是獨立頁面
  - `s1_dev_spec.md` Task #13（L520）：帳單摘要併入 Dashboard，沒有獨立帳單 Task
  - `s1_dev_spec.md` 受影響檔案表（L40-68）：沒有 `portal/billing/page.tsx`
  - `s1_frontend_handoff.md` L448：`UserBilling | /portal/billing | New`
  - `sdd_context.json` L203：`portal/billing/page.tsx` type: new
- **Recommendation**: 明確決策：帳單是獨立頁面還是 Dashboard 區塊。若獨立頁面，dev_spec 需新增 Task（建立 billing page、從 portal layout 導航）。若合併進 Dashboard，更新 frontend_handoff 和 sdd_context 移除 billing 頁面引用。建議保持獨立頁面（與 S0 一致），因為帳單資訊量大。

---

### SR-7
- **Severity**: P1
- **Category**: feasibility
- **Description**: dev_spec Task #12 的 middleware 修改方案有問題。Task #12 描述需要在 middleware 中 server-side 呼叫 `GET /auth/me` 來判斷角色，但現有 middleware.ts 跑在 Next.js Edge Runtime 中。Edge Runtime 對外部 fetch 有限制，且在 middleware 中對自家後端做同步 HTTP 呼叫會引入延遲（每次頁面請求都要 round-trip 到 api-server）。更重要的是，frontend_handoff 和 sdd_context 採用完全不同的方案——AuthContext client-side probe `GET /admin/users?limit=1`（L56-57, sdd_context L229-230）。兩個方案互相矛盾。
- **Evidence**:
  - `s1_dev_spec.md` Task #12（L500-512）：middleware server-side 呼叫 /auth/me
  - `s1_frontend_handoff.md` L56：「AuthContext probe `/admin/users?limit=1` 判斷角色」
  - `sdd_context.json` L229：「前端 probe GET /admin/users?limit=1（200=admin, 非200=user）」
  - 現有 `middleware.ts`：只做 Supabase auth check，不做角色判斷
- **Recommendation**: 統一方案。建議採用 AuthContext client-side 方案（probe /admin/users），因為：(1) 不增加 middleware 複雜度和延遲；(2) 不需要新增 /auth/me endpoint；(3) 與 sdd_context 記錄一致。若堅持 /auth/me 方案，則 frontend_handoff 和 sdd_context 都要更新。

---

### SR-8
- **Severity**: P1
- **Category**: feasibility
- **Description**: `topup_logs` 表在現有 migration 中不存在。init_schema.sql 沒有 topup_logs 的 CREATE TABLE，但 database.types.ts 有 TopupLog interface，admin.ts 有 /admin/topup-logs 路由直接查詢此表。dev_spec U1 裁決聲稱「004_topup_logs.sql 存在」，這與事實不符——migrations 目錄只有一個檔案 `20260314000000_init_schema.sql`。topup_logs 表可能是透過 Supabase Dashboard 手動建立的，沒有 migration 檔案。sdd_context 承認這個問題（L180: "topup_logs 缺 migration 檔案，本次補上"），但 dev_spec 本身的 U1 裁決寫的是「已解決——004_topup_logs.sql 存在」，這是錯誤資訊。
- **Evidence**:
  - `s1_dev_spec.md` L26：U1 裁決「已解決 -- 004_topup_logs.sql 存在」
  - 實際 migrations 目錄：只有 `20260314000000_init_schema.sql`，無 004_topup_logs.sql
  - `sdd_context.json` L180：「topup_logs 缺 migration 檔案，本次補上」
  - `sdd_context.json` impact_scope.database L193：migration 檔案名為 `20260315000000_analytics.sql`，描述包含「topup_logs migration」
- **Recommendation**: 修正 dev_spec U1 裁決為「未解決——migration 不存在，需在 008_analytics.sql 中補建」。Task #1 的描述和 DoD 需明確加入 topup_logs 的 IF NOT EXISTS migration。注意 topup_logs 的實際欄位需要從 database.types.ts 和 TopupService.ts 反推確認。

---

### SR-9
- **Severity**: P1
- **Category**: consistency
- **Description**: S0 定義用戶 Dashboard 路徑為 `/dashboard`，dev_spec 裁決為 `/portal/dashboard`（U5），但 s0_brief_spec Section 4.4.1 的頁面結構寫的是 `/dashboard`，而 Section 8.1 的畫面清單也寫 `/dashboard`、`/billing`（非 `/portal/dashboard`、`/portal/billing`）。dev_spec 正確地改為 `/portal/dashboard`（沿用現有 /portal/* 結構），但 S0 的成功標準和驗收描述仍引用 `/dashboard`。需確保驗收時使用正確路徑。
- **Evidence**:
  - `s0_brief_spec.md` L540：路徑 `/dashboard`
  - `s1_dev_spec.md` L31：U5 裁決 `/portal/dashboard`
  - 現有 middleware.ts L54-56：matcher 包含 `/portal/:path*`
- **Recommendation**: 這不是 dev_spec 的錯誤，而是 S0→S1 的合理演進。但 Task #16 整合測試的 DoD 應明確寫出最終路徑 `/portal/dashboard`，避免歧義。

---

### SR-10
- **Severity**: P1
- **Category**: risk
- **Description**: dev_spec 的 `apiGet` 函式擴充（加入 AbortSignal）是一個 breaking change。現有 api.ts 的 `apiGet` 簽名為 `apiGet<T>(path, token)`，dev_spec 要新增 signal 參數。這會影響所有現有的 `makeAdminApi`、`makeTopupApi`、`makeKeysApi` 呼叫——雖然新參數是 optional 所以 TypeScript 不會報錯，但 apiPost 和 apiPatch 也需要同步修改以支援 signal（frontend_handoff L377-384 只展示了 apiGet 的修改）。若只改 apiGet 不改 apiPost/apiPatch，那 makeRatesApi 的 create/update 方法就無法傳入 signal。
- **Evidence**:
  - `s1_frontend_handoff.md` L378-384：只展示 apiGet 的 signal 支援
  - `s1_frontend_handoff.md` L367-371：makeRatesApi.create 和 update 未接受 signal
  - 現有 `api.ts` L130-160：apiPost, apiPatch 無 signal 參數
- **Recommendation**: 如果 Rates CRUD（POST/PATCH）不需要 AbortSignal（通常 mutation 不需要），可以不改 apiPost/apiPatch。但需要在 spec 中明確說明這個設計決策。建議 spec 標註「只有 GET 請求支援 AbortSignal，mutation（POST/PATCH/DELETE）不支援」。

---

### SR-11
- **Severity**: P1
- **Category**: completeness
- **Description**: S0 成功標準 #13「model-breakdown 返回的 token 比例與 usage_logs 實際分布一致」在 dev_spec 驗收標準 7.1 表格中完全沒有對應項。dev_spec 的 15 條驗收標準覆蓋了 S0 的 15 條成功標準中的大部分，但「資料正確性驗證」類型的標準（確認 API 回傳值與 DB 實際值一致）在 dev_spec 中只以 Task DoD 形式出現（Task #4 DoD），沒有在 Section 7.1 驗收標準中。
- **Evidence**:
  - `s0_brief_spec.md` 成功標準 #13（L468）
  - `s1_dev_spec.md` Section 7.1（L612-629）：無 model-breakdown 資料正確性驗收
  - `s1_dev_spec.md` Task #4 DoD（L377）：有 getModelBreakdown 回傳正確分布比例
- **Recommendation**: 在 dev_spec Section 7.1 新增驗收項：「model-breakdown API 回傳的 percentage 與 usage_logs GROUP BY model_tag 的實際分布一致」。

---

### SR-12
- **Severity**: P1
- **Category**: completeness
- **Description**: api_spec 的 billing/summary endpoint 沒有 period 參數（L218：「無額外 query parameters」），但 dev_spec Task #6 描述 getBillingSummary 接受 `userId, period` 兩個參數（L406），S0 帳單區塊描述也提到「本期消耗費用」。兩者對 billing 是否支援 period 篩選的設計不一致。此外 dev_spec 3.1 流程圖（L122）中用戶 fetch billing 時帶了 `period=30d`，但 api_spec 明確說沒有 period 參數。
- **Evidence**:
  - `s1_api_spec.md` L218：「無額外 query parameters」
  - `s1_api_spec.md` L245：`"period": "all_time"` 在回應中
  - `s1_dev_spec.md` L406：`getBillingSummary(userId, period)`
  - `s1_dev_spec.md` L122：`GET /analytics/billing?period=30d`
- **Recommendation**: 統一決策。建議 billing 採用 all_time（與 api_spec 一致），因為帳單費用通常是累計概念。更新 dev_spec Task #6 和流程圖。

---

### SR-13
- **Severity**: P1
- **Category**: feasibility
- **Description**: dev_spec 的延遲查詢使用 `PERCENTILE_CONT` 是 PostgreSQL ordered-set aggregate function，但 Supabase client SDK 不支援直接執行 raw SQL（需透過 RPC function 或 Supabase Edge Function）。dev_spec 的 AggregationService 描述（Task #4, #5）似乎假設可以用 `supabaseAdmin` client 直接執行 raw SQL，但 Supabase JS client 只支援 table query builder（`.from().select()`）。sdd_context 提到「8 個 Supabase RPC functions」（L135），但 dev_spec 本身沒有定義任何 RPC function。
- **Evidence**:
  - `s1_dev_spec.md` Task #4-6：描述 SQL 邏輯但未提及 RPC function
  - `sdd_context.json` L135：「核心聚合邏輯封裝為 8 個 Supabase RPC functions」
  - `sdd_context.json` L193：migration 描述包含「8 RPC functions」
  - `s1_dev_spec.md` Task #1 DoD（L331-338）：完全沒提及 RPC functions
- **Recommendation**: dev_spec Task #1 必須加入 RPC function 的定義和 DoD。每個聚合查詢（timeseries, model-breakdown, latency percentile, billing cost, overview, admin timeseries, top-users ranking, 可能還有 latency admin）都需要對應的 RPC function。Task #4-6 的 AggregationService 描述需改為「呼叫 RPC function」而非直接寫 SQL。這是實作可行性的關鍵缺口。

---

### SR-14
- **Severity**: P2
- **Category**: consistency
- **Description**: dev_spec Task #1 migration 檔案命名為 `008_analytics.sql`（L331），但 sdd_context.json 中記錄為 `20260315000000_analytics.sql`（L193）。現有 migration 使用 timestamp 命名格式（`20260314000000_init_schema.sql`），dev_spec 的 `008_` 前綴不符合專案慣例。
- **Evidence**:
  - `s1_dev_spec.md` L331：`008_analytics.sql`
  - `sdd_context.json` L193：`20260315000000_analytics.sql`
  - 現有 migration：`20260314000000_init_schema.sql`（timestamp 格式）
- **Recommendation**: 統一為 timestamp 格式，如 `20260315000000_analytics.sql`。

---

### SR-15
- **Severity**: P2
- **Category**: risk
- **Description**: `topup_logs.amount_usd` 欄位在 database.types.ts 中定義為 `number`，dev_spec 和 api_spec 都說原始值為 cents（需除以 100）。但 database.types.ts 的欄位名稱就叫 `amount_usd`，暗示已經是 USD 單位。S0 成功標準沒有特別提到這個轉換邏輯，但如果前後端對「原始值單位」的理解不一致，帳單金額會差 100 倍。
- **Evidence**:
  - `s1_api_spec.md` L276-279：「topup_logs.amount_usd 原始值為 cents，API 回傳時除以 100 轉為 USD」
  - `database.types.ts` L112：`amount_usd: number`
  - `s0_brief_spec.md` Section 4.2.1 定義 topup_logs 欄位名為 `amount_usd`（暗示是 USD）
- **Recommendation**: 在 Task #6 DoD 中加入明確的驗證項：「確認 topup_logs.amount_usd 實際儲存單位（是 cents 還是 USD），並在 AggregationService 中正確處理」。建議在 S4 實作前先查詢實際資料確認。

---

### SR-16
- **Severity**: P2
- **Category**: completeness
- **Description**: S0 的 Admin Dashboard 頁面結構（Section 4.5.1）包含「全平台 Model 分布圓環圖」，但 dev_spec Task #14（Admin Analytics 頁面）的 DoD 和描述中沒有 DonutChart。dev_spec Section 7.1 驗收標準也沒有涵蓋 Admin 的 model 分布圖。api_spec 沒有定義 Admin 端的 model-breakdown endpoint。
- **Evidence**:
  - `s0_brief_spec.md` L361：「全平台 Model 分布圓環圖」
  - `s1_dev_spec.md` Task #14（L538-547）：結構描述無 DonutChart
  - `s1_api_spec.md`：無 `GET /admin/analytics/model-breakdown` endpoint
- **Recommendation**: 要麼在 admin analytics 加入 model-breakdown endpoint（或複用 admin timeseries 的 per-model 資料前端計算比例），要麼明確在 S1 中將此功能標記為 scope out with justification。

---

### SR-17
- **Severity**: P2
- **Category**: consistency
- **Description**: frontend_handoff 定義共用元件的檔案路徑與 dev_spec 不一致。dev_spec 將 StatsCard 等元件放在 `components/analytics/` 目錄下（L63-66），但 frontend_handoff 將它們放在 `components/` 根目錄（L467-471，如 `src/components/StatsCard.tsx`、`src/components/PeriodSelector.tsx`）。
- **Evidence**:
  - `s1_dev_spec.md` L63-66：`components/analytics/StatsCard.tsx` 等
  - `s1_frontend_handoff.md` L467-471：`src/components/StatsCard.tsx` 等
- **Recommendation**: 統一路徑。建議放在 `components/analytics/` 下（dev_spec 方案），避免與其他功能的元件混在一起。更新 frontend_handoff。

---

### SR-18
- **Severity**: P2
- **Category**: risk
- **Description**: 現有 middleware.ts 在認證用戶訪問 `/admin/login` 時，直接重導向 `/admin/dashboard`（L48-49）。dev_spec Task #12 需要根據角色分流（Admin -> /admin/dashboard, 一般用戶 -> /portal/dashboard），但如果一般用戶登入後被 middleware 重導向到 `/admin/dashboard`，然後又因為不是 Admin 被重導向到 `/portal/dashboard`，會造成二次跳轉。這個回歸風險在 dev_spec 風險清單中未具體提及。
- **Evidence**:
  - 現有 `middleware.ts` L47-49：`if (user && pathname === '/admin/login') { redirect /admin/dashboard }`
  - `s1_dev_spec.md` Task #12（L500-512）：角色分流邏輯
- **Recommendation**: Task #12 DoD 應明確包含：「修改 /admin/login 重導向邏輯，已認證的一般用戶應直接導向 /portal/dashboard，不應先到 /admin/dashboard 再跳轉」。

---

### SR-19
- **Severity**: P2
- **Category**: completeness
- **Description**: dev_spec 和 api_spec 都沒有定義 `GET /auth/me` 的完整 API 規格（request/response schema）。dev_spec Task #2 有基本描述（L345-351），但 api_spec 完全沒有收錄這個 endpoint 的規格。作為一個跨前後端的關鍵 endpoint（middleware 和 AuthContext 都依賴它），缺少正式 API 契約文件。
- **Evidence**:
  - `s1_api_spec.md`：無 /auth/me 定義
  - `s1_dev_spec.md` Task #2（L345）：只有簡短描述
- **Recommendation**: 在 api_spec 補上 `GET /auth/me` 的完整規格（包含 request、response schema、error codes）。

---

### SR-20
- **Severity**: P2
- **Category**: consistency
- **Description**: sdd_context.json 與 dev_spec 在多處技術決策上不一致。sdd_context 的 solution_summary（L135）提到「shadcn/ui charts（Recharts-based）」，unknowns_resolved U3（L230）也說「採用 shadcn/ui charts」。但 dev_spec 全文採用的是直接使用 Recharts（L588：「直接用 Recharts 無相容風險」）。此外 sdd_context 說 AggregationService 是 RPC 呼叫封裝（L136），dev_spec 說是直接 SQL。
- **Evidence**:
  - `sdd_context.json` L135：「shadcn/ui charts（Recharts-based，相容 Tailwind v4）」
  - `sdd_context.json` L230：U3「採用 shadcn/ui charts（Recharts-based），Tremor 不相容 Tailwind v4」
  - `s1_dev_spec.md` L588：「Recharts | Tremor v3 未支援 Tailwind v4...直接用 Recharts」
  - `s1_dev_spec.md` L28：U3「Recharts（跳過 Tremor）」
- **Recommendation**: 統一 sdd_context 與 dev_spec 的技術選型描述。如果最終選擇是直接用 Recharts（非 shadcn/ui charts），更新 sdd_context。如果是 shadcn/ui charts，更新 dev_spec。這會影響 Task #9 的實作方式。

---

## 統計摘要

| Severity | Count | IDs |
|----------|-------|-----|
| **P0** | 3 | SR-1, SR-2, SR-3 |
| **P1** | 8 | SR-4, SR-5, SR-6, SR-7, SR-8, SR-10, SR-11, SR-12, SR-13 |
| **P2** | 7 | SR-9, SR-14, SR-15, SR-16, SR-17, SR-18, SR-19, SR-20 |

> **P0: 3, P1: 9, P2: 7**

---

## 審查結論

**判定：REVISE_REQUIRED**

3 個 P0 必須在 S2 通過前修正：
1. **SR-1**：用戶 API 路徑在 dev_spec 與 api_spec 之間完全不同，這會直接導致前後端實作不一致
2. **SR-2**：Admin analytics 遺漏 timeseries endpoint，會導致 S0 成功標準 #6 無法達成
3. **SR-3**：model_rates 缺少 created_by 欄位，三份文件定義不一致

9 個 P1 中最關鍵的是 **SR-13**（RPC function 缺失——dev_spec 與 sdd_context 的聚合策略自相矛盾）和 **SR-7**（角色偵測方案 middleware vs AuthContext 互相矛盾）。這兩個如果不在 S2 釐清，S4 實作會立即撞牆。

建議修正流程：先修 P0 + SR-7 + SR-13 → R2 防禦者確認 → 通過 S2 Gate。
