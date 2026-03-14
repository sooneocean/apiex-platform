# R2 Defense

session: 20260314_review
timestamp: 2026-03-14T12:00:00Z

---

### CR-1：Anthropic 上游 URL 重複 /v1

**回應類型**：接受

**論述**：R1 完全正確。Seed data 在 `20260314000000_init_schema.sql:107` 設定 `upstream_base_url = 'https://api.anthropic.com/v1'`，而 `RouterService.ts:98-99` 在 anthropic provider 時拼接 `${baseUrl}/v1/messages`，最終產生 `https://api.anthropic.com/v1/v1/messages`。同時 `AnthropicAdapter.getBaseUrl()` 回傳 `https://api.anthropic.com`（不含 `/v1`），與 seed data 不一致。這是 P0 等級的問題，會導致所有 apex-smart 請求 404。

**修正方案**：Seed data 改為 `https://api.anthropic.com`（與 `AnthropicAdapter.getBaseUrl()` 回傳值一致），這是最乾淨的修法。

**證據**：
- `RouterService.ts:96-99`：`const baseUrl = route.upstream_base_url || adapter.getBaseUrl()` → `${baseUrl}/v1/messages`
- `init_schema.sql:107`：`('apex-smart', 'anthropic', 'claude-opus-4-6', 'https://api.anthropic.com/v1')`
- `AnthropicAdapter.ts:173-175`：`getBaseUrl(): string { return 'https://api.anthropic.com' }`

---

### CR-2：GeminiAdapter.transformStreamChunk() 型別不匹配

**回應類型**：接受

**論述**：R1 完全正確。`RouterService.ts:229` 已經 `JSON.parse(currentData)` 把 data 解析為 object，傳入 adapter 時 `data` 已是 parsed object。但 `GeminiAdapter.ts:70` 把 `chunk.data` cast 為 `string`，第 79 行再次 `JSON.parse(data)`。對一個 object 做 `JSON.parse()` 會先呼叫 `.toString()` 得到 `"[object Object]"`，然後 parse 失敗拋 SyntaxError，被第 80 行空 catch 吞掉，回傳 `{ chunk: null, done: false }`。所有 Gemini streaming chunk 確實會被靜默丟棄。

值得注意的是，`AnthropicAdapter.ts:81` 正確地使用 `const data = chunk.data as Record<string, unknown>`，沒有這個問題。兩個 adapter 的處理方式不一致。

**修正方案**：`GeminiAdapter.transformStreamChunk()` 應直接使用 `chunk.data as Record<string, unknown>`，移除多餘的 `JSON.parse` 和 `[DONE]` 檢查（`[DONE]` 已在 `RouterService.createTransformedSSEStream():221` 層處理）。

**證據**：
- `RouterService.ts:229-231`：`const parsed = JSON.parse(currentData)` → `adapter.transformStreamChunk({ event: currentEvent || 'data', data: parsed }, ...)`
- `GeminiAdapter.ts:69-82`：`const data = chunk.data as string` → `JSON.parse(data)` → catch → `{ chunk: null, done: false }`
- `AnthropicAdapter.ts:81`：`const data = chunk.data as Record<string, unknown>` — 正確做法

---

### CR-3：Anthropic finish_reason 未映射至 OpenAI 格式

**回應類型**：接受

**論述**：R1 正確。`AnthropicAdapter.ts:66` 直接透傳 `res.stop_reason`，沒有做映射。Anthropic 使用 `end_turn`、`max_tokens` 等值，OpenAI 使用 `stop`、`length` 等值。這直接違反 S0 Success Criteria #1：「OpenAI SDK 僅替換 base_url 和 api_key，零程式碼修改可呼叫成功」。OpenAI SDK 的 client 程式碼會檢查 `finish_reason === 'stop'` 來判斷回應是否正常結束，收到 `end_turn` 會導致意外行為。

我同意這是 P1 blocking。

**修正方案**：加入 R1 建議的映射表。

**證據**：
- `AnthropicAdapter.ts:66`：`finish_reason: res.stop_reason,`
- 對比 `GeminiAdapter.ts:148-149`：Gemini adapter 有 `normalizeFinishReason()` 做大寫轉小寫，但 Anthropic adapter 連映射都沒有。

---

### CR-4：SQL function reserve_quota、settle_quota、admin_list_users 未定義

**回應類型**：接受

**論述**：R1 完全正確。我已用 grep 確認整個 `supabase/migrations/` 目錄中完全沒有 `reserve_quota`、`settle_quota`、`admin_list_users` 這三個 SQL function 的定義。唯一的 migration 檔 `20260314000000_init_schema.sql` 只有 table、RLS、seed data，沒有任何 `CREATE FUNCTION`。

`KeyService.ts:153` 呼叫 `supabaseAdmin.rpc('reserve_quota', ...)`、`KeyService.ts:180` 呼叫 `supabaseAdmin.rpc('settle_quota', ...)`、`admin.ts:18` 呼叫 `supabaseAdmin.rpc('admin_list_users', ...)`。部署後這三個 RPC 全部會失敗。

這是 P1 blocking 而非 P0，因為問題可以透過新增 migration 修復，不涉及架構重設計。但功能影響確實很大——quota 機制和 admin 列表全掛。

**修正方案**：新增 migration 定義這三個 SQL function。`reserve_quota` 和 `settle_quota` 需要特別處理 `quota_tokens = -1`（unlimited）的 case。

**證據**：
- grep `reserve_quota|settle_quota|admin_list_users` 在 `supabase/` 下無結果
- `KeyService.ts:153`：`supabaseAdmin.rpc('reserve_quota', { p_key_id: keyId, p_estimated: estimatedTokens })`
- `KeyService.ts:180`：`supabaseAdmin.rpc('settle_quota', { p_key_id: keyId, p_diff: diff })`
- `admin.ts:18`：`supabaseAdmin.rpc('admin_list_users', { p_offset: ..., p_limit: ... })`

---

### CR-5：usage_logs 表缺少 user_id 欄位

**回應類型**：接受

**論述**：R1 正確。`admin.ts:98-99` 用 `query.eq('user_id', userId)` 篩選 usage_logs，但 `init_schema.sql:33-44` 的 usage_logs 表結構中確實沒有 `user_id` 欄位。PostgREST 會回傳 400。

**修正方案**：R1 的方案二更合理——改用 subquery 透過 `api_keys` 表 join。加冗餘欄位會增加寫入複雜度和資料一致性負擔。

**證據**：
- `admin.ts:98-99`：`if (userId) { query = query.eq('user_id', userId) }`
- `init_schema.sql:33-44`：usage_logs 欄位為 `id, api_key_id, model_tag, upstream_model, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, created_at`——無 `user_id`

---

### CR-6：GET /v1/usage/summary 忽略 period 參數

**回應類型**：接受

**論述**：R1 正確。`proxy.ts:164-186` 的 JSDoc 宣稱支援 `period` 參數（24h|7d|30d|all），但實作中完全沒有讀取 `c.req.query('period')`，也沒有任何時間範圍篩選。違反 API 契約。

S1 API Spec Summary 明確定義：`GET /usage/summary (API Key auth) — period filter: 24h|7d|30d|all`。

**修正方案**：依 R1 建議實作 period 篩選。

**證據**：
- `proxy.ts:164-170`：`router.get('/usage/summary', async (c) => { const apiKeyId = c.get('apiKeyId') as string` — 沒有讀取 period
- Input Context（S1 API Spec Summary）：`GET /usage/summary (API Key auth) — period filter: 24h|7d|30d|all`

---

### CR-7：POST /v1/chat/completions 缺少 messages 必填欄位驗證

**回應類型**：部分接受

**論述**：R1 指出 `body.messages` 沒有驗證是正確的。但嚴重度分類值得討論。R1 標記為 P1 recommended，我同意這個等級。不過論述中「浪費 quota 預扣額度」的影響有限——如果上游 API 拒絕空 messages，settleQuota 會把預扣額度退回（`proxy.ts:130`：catch block 呼叫 `settleQuota(apiKeyId, estimatedTokens, 0)`）。

真正的問題是：gateway 應該提供一致的錯誤體驗，而不是讓上游 API 的錯誤格式洩漏給 client。這才是加驗證的正當理由。

**修正方案**：在 model 驗證之前加入 `if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0)` 驗證，回傳 400。

**證據**：
- `proxy.ts:38-48`：直接 `c.req.json<OpenAIRequest>()` 後進入 model 驗證，沒有 messages 檢查
- `proxy.ts:127-143`：catch block 有退款邏輯，quota 浪費的風險有限

---

### CR-8：Streaming 中斷時 status 永遠記錄 success

**回應類型**：接受

**論述**：R1 正確。`proxy.ts:106-125` 的 finally block 中 `status` 固定為 `'success'`，即使 catch 了 stream error。這導致用量追蹤不準確。

但我要補充一點：`result.usage` 是 `RouterService.forward()` 回傳的 mutable reference object（`RouterService.ts:138`），在 stream 消費過程中由 `createTransformedSSEStream` 累積更新。如果 stream 中途斷掉，usage 值會是不完整的。用不完整的值做 `settleQuota` 確實會導致額度計算錯誤——但方向是「用戶被多扣」（因為 settle 退回的差額 = estimated - actual_partial，而 actual_partial < actual_full）。

**修正方案**：在 streaming handler 中加入 error flag。catch block 設 `hasError = true`，finally 中根據 flag 決定 status。stream 中斷時考慮全額退款。

**證據**：
- `proxy.ts:106-107`：`catch (err) { console.error('Stream error:', err) }`
- `proxy.ts:108-125`：finally 中 `status: 'success'` 硬編碼

---

### CR-9：Admin quota 驗證誤用 Errors.unsupportedModel

**回應類型**：接受

**論述**：R1 正確。`admin.ts:42-43` 對 `quota_tokens < -1` 回傳 `Errors.unsupportedModel(...)`，語義完全不匹配。這會產生 error code `unsupported_model`，但問題是參數驗證失敗。

**修正方案**：使用 `Errors.invalidRequest('quota_tokens must be >= -1')` 或類似的通用 400 錯誤。

**證據**：
- `admin.ts:42-43`：`return Errors.unsupportedModel('quota_tokens must be >= -1')`

---

### CR-10：Admin PATCH quota 的 updated_keys 計數永遠為 0

**回應類型**：接受

**論述**：R1 正確。`admin.ts:64-68` 的 `.update()` 沒有 `.select()`，Supabase PostgREST 在沒有 `.select()` 時，`data` 回傳 `null`。因此 `updatedKeys?.length` 永遠是 `undefined`，`updated_keys` 永遠顯示 0。

**修正方案**：在 `.update()` 後加上 `.select('id')`。

**證據**：
- `admin.ts:64-69`：`.update({ quota_tokens: body.quota_tokens }).eq('user_id', userId).eq('status', 'active')` — 無 `.select()`
- `admin.ts:77`：`updated_keys: updatedKeys?.length ?? 0`

---

### CR-11：Anthropic streaming 未在最後一個 chunk 發送 finish_reason

**回應類型**：接受

**論述**：R1 正確。OpenAI streaming 協議要求最後一個 content chunk 包含 `finish_reason`，但 AnthropicAdapter 的 `message_delta`（第 130-141 行）只回傳 usage 且 `chunk: null`，`message_stop`（第 144-146 行）也是 `chunk: null`。客戶端永遠收不到帶有 `finish_reason` 的 chunk。

這與 CR-3 密切相關，應一起修復。

**修正方案**：在 `message_delta` event 中，除了回傳 usage 外，也回傳一個包含 `finish_reason`（已映射）且 `delta: {}` 的 final chunk。

**證據**：
- `AnthropicAdapter.ts:130-141`：`case 'message_delta': { ... return { chunk: null, done: false, usage: { ... } } }`
- `AnthropicAdapter.ts:144-146`：`case 'message_stop': { return { chunk: null, done: true } }`

---

### CR-12：POST /auth/login 回傳假造的 expires_at

**回應類型**：部分接受

**論述**：R1 指出 `auth.ts:38-39` 的 `expires_at` 是硬編碼的 placeholder，技術上正確。但我要降級這個問題的嚴重性。

1. 這是一個 token validation endpoint，不是 token issuing endpoint。Server 回傳的 `expires_at` 只是方便 client 判斷何時 refresh，但 client 也可以（而且應該）根據 Supabase SDK 自帶的 session management 來處理 refresh。
2. Supabase JWT 預設 expiry 是 1 小時（3600 秒），這個 placeholder 值在大多數情況下其實是接近正確的。
3. 這不會導致安全問題——JWT 驗證是在 server side 做的，client 的 `expires_at` 只影響 UX 體驗。

P2 等級合理，不需要提升。

**修正方案**：可以從 JWT payload decode `exp` 欄位，但優先級低。

**證據**：
- `auth.ts:38-39`：`expires_at: Math.floor(Date.now() / 1000) + 3600`
- Supabase 預設 JWT 過期時間也是 3600 秒

---

### CR-13：Anthropic streaming chunk id 不穩定

**回應類型**：部分接受

**論述**：R1 說每個 chunk 用 `chatcmpl-${Date.now()}` 會產生不同 id 是正確的。但「OpenAI SDK 可能用 id 做 dedup 或 grouping」的說法需要驗證——實務上 OpenAI 官方 Python/Node SDK 不會對 streaming chunk 的 id 做 dedup 或 grouping。chunk id 主要用於 logging 和 tracing。

不過，id 不穩定確實違反 OpenAI 的行為慣例（同一 completion 的所有 chunk 共享 id），可能影響某些第三方 client。P2 等級合理。

**修正方案**：在 stream 開始時產生固定 id，後續 chunk 共用。最理想是從 `message_start` event 取得 Anthropic message id 並轉換。

**證據**：
- `AnthropicAdapter.ts:109`：`id: \`chatcmpl-${Date.now()}\``

---

### CR-14：/usage 路由掛載了空的 Hono instance

**回應類型**：接受

**論述**：R1 正確。`index.ts:47` 建立了一個空的 `Hono()` instance 並掛載在 `/usage`，完全沒有任何 route。實際的 usage endpoint（`/v1/usage/summary`）是透過 proxy routes 提供的。這是死碼。

註解（第 46 行）說 "usage/summary is served under /v1/usage/summary via proxy routes"，那這段掛載就更沒有存在的必要了。

**修正方案**：移除第 46-48 行。

**證據**：
- `index.ts:46-48`：`const usage = new Hono()` + `app.route('/usage', usage)` — 空 router，無任何 route

---

### CR-15：JSON body parse 失敗時回傳 500 而非 400

**回應類型**：部分接受

**論述**：R1 指出 `c.req.json()` parse 失敗會被 global error handler 捕捉後回傳 500 是正確的。但這是一個邊界情況——正常的 OpenAI SDK client 一定會送 valid JSON。而且 global error handler（`index.ts:60-66`）會捕捉所有非 ApiError 的異常回傳 500，這是全局行為，不只影響這一個 endpoint。

P2 等級合理。修復優先級低。

**修正方案**：在 `c.req.json()` 外包 try-catch，parse 失敗時回傳 `Errors.invalidRequest('Invalid JSON body')`。

**證據**：
- `proxy.ts:40`：`const body = await c.req.json<OpenAIRequest>()` — 無 try-catch
- `index.ts:60-66`：global error handler 對非 ApiError 回傳 500

---

### CR-16：GET /v1/models 的 created 欄位每次都是當前時間

**回應類型**：部分接受

**論述**：R1 說 `created` 每次不同是對的。但 R1 稱「OpenAI SDK 可能用此欄位做 cache key」的說法沒有根據——OpenAI SDK 不會對 models list 做 cache。`created` 欄位在 OpenAI 自己的 API 也是一個 unix timestamp，client 不會拿來做 cache key。

這是 P2 等級的 cosmetic 問題。不影響功能。

**修正方案**：可以用 route_config 的 `updated_at` 或 app 啟動時間作為固定值，但非必要。

**證據**：
- `RouterService.ts:178`：`created: Math.floor(Date.now() / 1000)`

---

### CR-17：ADMIN_EMAILS 未設定時無任何提示

**回應類型**：接受

**論述**：R1 正確。部署時忘記設定 `ADMIN_EMAILS`，所有 admin 請求都會被 `adminAuth.ts:54` 的 `ADMIN_EMAILS.includes(user.email)` 拒絕，但沒有任何 startup warning。這會導致部署後排查困難。

P2 等級合理。

**修正方案**：在 app 啟動時（或 middleware 初始化時）檢查 `ADMIN_EMAILS` 是否為空，輸出 warning log。

**證據**：
- `adminAuth.ts:7`：`const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)`
- `adminAuth.ts:54`：`if (!user.email || !ADMIN_EMAILS.includes(user.email)) { return Errors.adminRequired() }`

---

### CR-18：SSE 解析空 catch 靜默吞掉所有 JSON parse 錯誤

**回應類型**：接受

**論述**：R1 正確。`RouterService.ts:250-252` 的空 catch 確實會讓系統性的上游格式問題變得極難 debug。特別是在 CR-2 那種 type mismatch 的情境下，所有 chunk 都被吞掉卻沒有任何 log。

P2 等級合理，但建議升級為 P1 recommended——因為這個靜默吞錯直接掩蓋了 CR-2 這種 P0 問題的表徵。

**修正方案**：加入 `console.warn` 記錄被跳過的 chunk 內容（truncated）。

**證據**：
- `RouterService.ts:250-252`：`} catch { // Skip unparseable chunks }`

---

### CR-19：listKeys 的 key_hash 排除邏輯是無效代碼

**回應類型**：接受

**論述**：R1 正確。`KeyService.ts:112` 的 `.select()` 明確列出欄位（不包含 `key_hash`），回傳的 data 本來就沒有 `key_hash`。第 121-123 行的 destructuring 排除是多餘的。

但我要指出，這段代碼雖然冗餘，但目的是「防禦性程式設計」——確保即使 select 欄位列表被意外修改，也不會洩漏 key_hash。意圖合理但執行不夠好（如果真的擔心洩漏，應該用 allowlist pattern 而非 denylist）。

P2 等級合理。

**修正方案**：直接 `return data as ApiKeyRecord[]`，或改用 allowlist 映射確保只回傳安全欄位。

**證據**：
- `KeyService.ts:112`：`.select('id, user_id, name, prefix, status, quota_tokens, created_at')`
- `KeyService.ts:121-123`：`({ key_hash: _removed, ...rest }) => rest`

---

### CR-20：整合測試覆蓋率極低

**回應類型**：接受

**論述**：R1 正確。整合測試只有 4 個 test case，全部是 negative path（health check、401、404 格式）。核心的 proxy 成功路徑、streaming、quota 流程完全沒有整合測試。

P2 等級合理，但這也是 MVP 階段的常見取捨。

**修正方案**：補充 proxy 成功路徑（mock upstream response）、streaming 端對端、quota exhausted 等整合測試場景。

**證據**：
- `integration.test.ts`：115 行，4 個 test case，全部是 negative/error path

---

### CR-21：Dashboard getToken() 中 router.push 後仍 throw

**回應類型**：部分接受

**論述**：R1 指出 `router.push` 後 `throw` 會導致 error state 被設定是正確的。但實際影響需要看 caller 的行為：

`fetchUsers`（第 31-45 行）和 `fetchKeys`（第 47-61 行）的 catch block 會設定 error state（`setUsersError` / `setKeysError`），然後 finally 設 loading false。由於 `router.push` 是異步導航，在 Next.js App Router 中不會立即中斷當前 render cycle，所以確實會短暫顯示錯誤訊息再跳轉。

但這是 P2 等級的 UX 問題，不影響功能正確性。

**修正方案**：`router.push` 後 `return '' as never`，或在 catch 中判斷 `e.message === 'Not authenticated'` 時不設 error state。

**證據**：
- `dashboard/page.tsx:24-27`：`router.push('/admin/login')` → `throw new Error('Not authenticated')`
- `dashboard/page.tsx:39-40`：`catch (e) { setUsersError(e instanceof Error ? e.message : '...') }`

---

### CR-22：API Key prefix 長度只有 8 字元

**回應類型**：接受

**論述**：R1 正確。`KeyService.ts:55` 的 `plainKey.slice(0, 8)` 取前 8 字元，其中 `apx-sk-` 佔 7 字元，只有 1 個隨機字元作為辨識。管理多把 key 時幾乎無法區分。

P2 等級合理。

**修正方案**：改為 `slice(0, 14)` 或 `slice(0, 16)`，確保有足夠隨機字元。例如 `apx-sk-` (7) + 7 個隨機字元 = 14 字元 prefix。

**證據**：
- `KeyService.ts:54-55`：`const plainKey = \`apx-sk-${base64url}\`` → `const prefix = plainKey.slice(0, 8)` — prefix 為 `apx-sk-X`，只有 1 個隨機字元

---

## 統計摘要

| 回應類型 | 數量 |
|----------|------|
| 接受 | 16 |
| 部分接受 | 5 |
| 反駁 | 0 |
| 建議升級 | 1（CR-18 P2 → P1 recommended） |

### 接受的 P0/P1 問題（必須修復）

- **CR-1 (P0)**：Anthropic URL 重複 /v1 — 必修
- **CR-2 (P0)**：Gemini streaming type mismatch — 必修
- **CR-3 (P1 blocking)**：Anthropic finish_reason 未映射 — 必修
- **CR-4 (P1 blocking)**：SQL function 未定義 — 必修
- **CR-5 (P1 blocking)**：usage_logs 缺 user_id — 必修
- **CR-6 (P1 blocking)**：usage/summary 忽略 period — 必修
- **CR-7 (P1 recommended)**：缺 messages 驗證 — 建議修
- **CR-8 (P1 recommended)**：Streaming 狀態記錄錯誤 — 建議修
- **CR-9 (P1 recommended)**：錯誤語義不匹配 — 建議修
- **CR-10 (P1 recommended)**：updated_keys 永遠 0 — 建議修
- **CR-11 (P1 recommended)**：Streaming 缺 finish_reason — 建議修

### 結論

R1 的審查品質非常高，22 條 finding 中沒有任何一條是技術上不準確的。我沒有反駁任何一條。兩個 P0 + 四個 P1 blocking 的結論正確——此系統目前確實不具備上線條件。

修復優先順序建議：CR-4（SQL function）→ CR-1（URL）→ CR-2（Gemini streaming）→ CR-3 + CR-11（Anthropic finish_reason + streaming）→ CR-5（user_id）→ CR-6（period）。
