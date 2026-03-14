# S5 R1 Findings — apiex-platform（重新審查）

> 審查者：R1 挑戰者（單引擎嚴格模式，Opus 4.6 1M context）
> 審查日期：2026-03-14
> 審查範圍：api-server 核心實作 15 檔 + 測試 3 檔 + 前端 dashboard + CLI chat（共 20 檔）

---

## CR-1
- **Severity**: P0
- **File**: `packages/api-server/src/services/RouterService.ts:98-99` + `packages/api-server/supabase/migrations/20260314000000_init_schema.sql:107`
- **Title**: Anthropic 上游 URL 重複 /v1 — 所有 apex-smart 請求 404
- **Description**: Seed data 設定 `upstream_base_url = 'https://api.anthropic.com/v1'`，而 `RouterService.forward()` 在 anthropic provider 時拼接 `${baseUrl}/v1/messages`，最終產生 `https://api.anthropic.com/v1/v1/messages`。此 URL 不存在，Anthropic API 會回傳 404，導致**所有 apex-smart 請求全部失敗**。
- **Evidence**:
  ```typescript
  // RouterService.ts:96-99
  const baseUrl = route.upstream_base_url || adapter.getBaseUrl()
  const isAnthropic = route.upstream_provider === 'anthropic'
  const endpoint = isAnthropic
    ? `${baseUrl}/v1/messages`
    : `${baseUrl}/chat/completions`
  ```
  ```sql
  -- migration:107
  ('apex-smart', 'anthropic', 'claude-opus-4-6', 'https://api.anthropic.com/v1'),
  ```
  Seed 給 `https://api.anthropic.com/v1` + code 加 `/v1/messages` → `https://api.anthropic.com/v1/v1/messages`。
- **Recommendation**: Seed data 改為 `https://api.anthropic.com`（與 `AnthropicAdapter.getBaseUrl()` 回傳值一致），或 `forward()` 改為 `${baseUrl}/messages`。建議方案一，保持 adapter 的 fallback URL 與 seed data 語義一致。

---

## CR-2
- **Severity**: P0
- **File**: `packages/api-server/src/adapters/GeminiAdapter.ts:70-82` + `packages/api-server/src/services/RouterService.ts:229-231`
- **Title**: GeminiAdapter.transformStreamChunk() 型別不匹配 — Gemini streaming 全部靜默丟棄
- **Description**: `RouterService.createTransformedSSEStream()` 在第 229 行已經 `JSON.parse(currentData)` 將 data 解析為 object，傳入 adapter 時 `data` 已是 parsed object。但 `GeminiAdapter.transformStreamChunk()` 在第 70 行把 `chunk.data` cast 為 `string`，然後在第 79 行再次 `JSON.parse(data)`。對一個已解析的 object 做 `JSON.parse` 會拋出 TypeError（因為 `JSON.parse({}.toString())` → `JSON.parse("[object Object]")` → SyntaxError），被空 catch 吞掉，回傳 `{ chunk: null, done: false }`。結果：**所有 Gemini (apex-cheap) 的 streaming chunk 全部被靜默丟棄**，客戶端只收到最終的 `[DONE]`，沒有任何內容。
- **Evidence**:
  ```typescript
  // RouterService.ts:229-231
  const parsed = JSON.parse(currentData)
  const result: StreamChunkResult = adapter.transformStreamChunk(
    { event: currentEvent || 'data', data: parsed }, // data 已是 object
  ```
  ```typescript
  // GeminiAdapter.ts:69-82
  transformStreamChunk(chunk: { event: string; data: unknown }, model: string): StreamChunkResult {
    const data = chunk.data as string  // ← 實際上是 object，強轉為 string
    if (data === '[DONE]') { ... }     // ← object !== '[DONE]'，OK 但冗餘
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(data) as Record<string, unknown>  // ← 對 object JSON.parse → SyntaxError
    } catch {
      return { chunk: null, done: false }  // ← 靜默吞掉所有 chunk
    }
  ```
- **Recommendation**: `GeminiAdapter.transformStreamChunk()` 應直接使用 `chunk.data as Record<string, unknown>`，移除多餘的 `JSON.parse` 和 `[DONE]` 檢查（`[DONE]` 已在 `createTransformedSSEStream` 層處理）。

---

## CR-3
- **Severity**: P1 blocking
- **File**: `packages/api-server/src/adapters/AnthropicAdapter.ts:66`
- **Title**: Anthropic finish_reason 未映射至 OpenAI 格式 — 破壞 OpenAI SDK 相容性
- **Description**: Anthropic 的 stop_reason 使用 `end_turn`、`max_tokens`、`stop_sequence`、`tool_use`。OpenAI 的 finish_reason 使用 `stop`、`length`、`content_filter`、`tool_calls`。`transformResponse` 直接透傳 `res.stop_reason` 而沒有做映射。OpenAI SDK 判斷 `finish_reason === 'stop'` 時會失敗（收到 `end_turn`），這直接違反 S0 Success Criteria #1：「OpenAI SDK 僅替換 base_url 和 api_key，零程式碼修改可呼叫成功」。
- **Evidence**:
  ```typescript
  // AnthropicAdapter.ts:66
  finish_reason: res.stop_reason,  // 直接透傳，沒有映射
  ```
- **Recommendation**: 加入映射表：
  ```typescript
  const FINISH_REASON_MAP: Record<string, string> = {
    'end_turn': 'stop',
    'max_tokens': 'length',
    'stop_sequence': 'stop',
    'tool_use': 'tool_calls',
  }
  finish_reason: FINISH_REASON_MAP[res.stop_reason] ?? 'stop',
  ```

---

## CR-4
- **Severity**: P1 blocking
- **File**: `packages/api-server/supabase/migrations/20260314000000_init_schema.sql`（全檔）
- **Title**: SQL function `reserve_quota`、`settle_quota`、`admin_list_users` 未定義 — RPC 呼叫全部失敗
- **Description**: `KeyService` 呼叫 `supabaseAdmin.rpc('reserve_quota', ...)` 和 `rpc('settle_quota', ...)`，`adminRoutes` 呼叫 `supabaseAdmin.rpc('admin_list_users', ...)`。但 migration SQL 中**完全沒有定義這三個 SQL function**。部署後這些 RPC 呼叫會回傳 Supabase 的 function not found error，導致：
  - 額度預扣/結算全部失敗 → 所有 proxy 請求 500
  - 管理員列表全部失敗 → admin dashboard 無法使用
- **Evidence**: 用 grep 搜尋整個 `supabase/migrations/` 目錄，`reserve_quota`、`settle_quota`、`admin_list_users` 均無結果。唯一的 migration 檔只有 table/RLS/seed 定義。
- **Recommendation**: 在 migration 中新增這三個 SQL function，例如：
  ```sql
  CREATE OR REPLACE FUNCTION reserve_quota(p_key_id UUID, p_estimated BIGINT)
  RETURNS BIGINT AS $$
    UPDATE api_keys
    SET quota_tokens = CASE
      WHEN quota_tokens = -1 THEN -1
      ELSE quota_tokens - p_estimated
    END
    WHERE id = p_key_id
      AND (quota_tokens >= p_estimated OR quota_tokens = -1)
    RETURNING quota_tokens;
  $$ LANGUAGE sql;
  ```
  注意：unlimited key (`quota_tokens = -1`) 必須在 CASE 中保持 -1，否則會如前次 review P0-001 所述被破壞。

---

## CR-5
- **Severity**: P1 blocking
- **File**: `packages/api-server/src/routes/admin.ts:99` + `packages/api-server/supabase/migrations/20260314000000_init_schema.sql:33-44`
- **Title**: usage_logs 表缺少 user_id 欄位 — admin usage-logs 按用戶篩選會報錯
- **Description**: `admin.ts:99` 用 `query.eq('user_id', userId)` 篩選 usage_logs，但 usage_logs 表結構中沒有 `user_id` 欄位（只有 `api_key_id`）。Supabase PostgREST 會回傳 400 column not found error。
- **Evidence**:
  ```typescript
  // admin.ts:98-99
  if (userId) {
    query = query.eq('user_id', userId)
  }
  ```
  ```sql
  -- migration:33-44 — usage_logs 欄位列表
  id, api_key_id, model_tag, upstream_model, prompt_tokens,
  completion_tokens, total_tokens, latency_ms, status, created_at
  -- 沒有 user_id
  ```
- **Recommendation**: 方案一（推薦）：在 usage_logs 加入 `user_id UUID REFERENCES auth.users(id)` 冗餘欄位，UsageLogger 寫入時同時記錄。方案二：改用 subquery `query.in('api_key_id', supabaseAdmin.from('api_keys').select('id').eq('user_id', userId))`。

---

## CR-6
- **Severity**: P1 blocking
- **File**: `packages/api-server/src/routes/proxy.ts:164-186`
- **Title**: GET /v1/usage/summary 忽略 period 參數 — 永遠回傳全量資料
- **Description**: API spec 定義 `period` 參數支援 `24h|7d|30d|all`，proxy.ts 的 JSDoc 也宣稱支援，但實作完全沒有讀取 `c.req.query('period')`，直接查全量資料。違反 API 契約。
- **Evidence**:
  ```typescript
  // proxy.ts:164-170
  router.get('/usage/summary', async (c) => {
    const apiKeyId = c.get('apiKeyId') as string
    // 注意：沒有 const period = c.req.query('period')
    const { data } = await supabaseAdmin
      .from('usage_logs')
      .select('*')
      .eq('api_key_id', apiKeyId)
      // 沒有任何時間範圍篩選
  ```
- **Recommendation**: 讀取 `period` 參數，計算 `created_at` 的起始時間：
  ```typescript
  const period = c.req.query('period') ?? 'all'
  const periodMap: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 }
  let query = supabaseAdmin.from('usage_logs').select('*').eq('api_key_id', apiKeyId)
  if (period !== 'all' && periodMap[period]) {
    const since = new Date(Date.now() - periodMap[period] * 86400000).toISOString()
    query = query.gte('created_at', since)
  }
  ```

---

## CR-7
- **Severity**: P1 recommended
- **File**: `packages/api-server/src/routes/proxy.ts:38-48`
- **Title**: POST /v1/chat/completions 缺少 messages 必填欄位驗證
- **Description**: `body.messages` 沒有任何驗證（是否存在、是否為 array、是否至少一筆）。如果 client 送 `messages: []` 或完全省略 `messages`，請求會直接透傳到上游 API，浪費 quota 預扣額度。Gateway 應自行驗證必填欄位以提供一致的錯誤體驗。
- **Evidence**:
  ```typescript
  // proxy.ts:38-48
  router.post('/chat/completions', async (c) => {
    const body = await c.req.json<OpenAIRequest>()
    // 沒有 messages 驗證 → 直接進入 reserveQuota
  ```
- **Recommendation**: 在 model 驗證之前加入 messages 驗證。

---

## CR-8
- **Severity**: P1 recommended
- **File**: `packages/api-server/src/routes/proxy.ts:97-126`
- **Title**: Streaming 中斷時 status 永遠記錄 success — 用量追蹤不準確
- **Description**: streaming handler 的 `finally` block 中 `status` 固定為 `'success'`。即使 stream 在 catch block 中因錯誤中斷（line 106-107），仍然記錄 success。更嚴重的是，使用的 `result.usage` 在 stream 未完全消費時可能是不完整的值，用不完整的 `total_tokens` 做 `settleQuota` 會導致額度計算錯誤。
- **Evidence**:
  ```typescript
  // proxy.ts:106-125
  } catch (err) {
    console.error('Stream error:', err)
  } finally {
    // ...
    status: 'success',  // ← 即使上面 catch 了 error 也是 success
  ```
- **Recommendation**: 在 catch block 設定 error flag，finally 中根據 flag 決定 `status: 'incomplete'` 或 `status: 'success'`。stream 中斷時用 `actualTokens = 0` 做全額退款。

---

## CR-9
- **Severity**: P1 recommended
- **File**: `packages/api-server/src/routes/admin.ts:42-43`
- **Title**: Admin quota 驗證誤用 `Errors.unsupportedModel` — 錯誤語義完全不匹配
- **Description**: 當 `quota_tokens < -1` 時，回傳 `Errors.unsupportedModel('quota_tokens must be >= -1')`。這會產生 `{ error: { code: "unsupported_model", type: "invalid_request_error" } }`，語義完全不匹配。管理端 client 如果根據 error code 做處理會被誤導。
- **Evidence**:
  ```typescript
  // admin.ts:42-43
  if (body.quota_tokens < -1) {
    return Errors.unsupportedModel('quota_tokens must be >= -1')
  }
  ```
- **Recommendation**: 使用 `makeError('quota_tokens must be >= -1', 'invalid_request_error', 'invalid_parameter', 400)` 或新增 `Errors.invalidParameter()` 工廠方法。

---

## CR-10
- **Severity**: P1 recommended
- **File**: `packages/api-server/src/routes/admin.ts:64-77`
- **Title**: Admin PATCH quota 的 `updated_keys` 計數永遠為 0
- **Description**: Supabase 的 `.update()` 不帶 `.select()` 時，回傳的 `data` 為 `null`（不回傳更新後的行）。因此 `updatedKeys?.length` 永遠是 `undefined`，`updated_keys` 永遠顯示 0，即使實際更新了多筆 key。
- **Evidence**:
  ```typescript
  // admin.ts:64-69
  const { data: updatedKeys, error: keysError } = await supabaseAdmin
    .from('api_keys')
    .update({ quota_tokens: body.quota_tokens })
    .eq('user_id', userId)
    .eq('status', 'active')
    // 缺少 .select()
  // admin.ts:77
  updated_keys: updatedKeys?.length ?? 0,  // 永遠 0
  ```
- **Recommendation**: 在 `.update()` 後加上 `.select('id')` 以取得實際更新的行。

---

## CR-11
- **Severity**: P1 recommended（前次 review 遺漏）
- **File**: `packages/api-server/src/adapters/AnthropicAdapter.ts:130-146`
- **Title**: Anthropic streaming 未在最後一個 chunk 發送 finish_reason
- **Description**: OpenAI streaming 協議要求最後一個 content chunk 包含 `finish_reason: "stop"`。但 AnthropicAdapter 的 `message_delta` event（攜帶 stop_reason）只更新 usage 不發送 chunk；`message_stop` event 只設 `done: true` 不發送 chunk。客戶端永遠看不到 `finish_reason`，違反 OpenAI streaming 格式契約。
- **Evidence**:
  ```typescript
  // AnthropicAdapter.ts:130-141 — message_delta 只回傳 usage，chunk: null
  case 'message_delta': {
    const usage = data.usage as { output_tokens?: number }
    return { chunk: null, done: false, usage: { ... } }
  }
  // AnthropicAdapter.ts:144-146 — message_stop 只設 done，chunk: null
  case 'message_stop': {
    return { chunk: null, done: true }
  }
  ```
- **Recommendation**: 在 `message_delta` 或 `message_stop` 事件中發送一個包含 `finish_reason: 'stop'` 且 `delta: {}` 的 final chunk。需搭配 CR-3 的 finish_reason 映射一起修復。

---

## CR-12
- **Severity**: P2
- **File**: `packages/api-server/src/routes/auth.ts:38-39`
- **Title**: POST /auth/login 回傳假造的 expires_at
- **Description**: `session.expires_at` 使用 `Math.floor(Date.now() / 1000) + 3600` 硬編碼 1 小時，與實際 Supabase JWT 的過期時間無關。Client 依賴此值做 token refresh 判斷會出錯。
- **Evidence**:
  ```typescript
  // auth.ts:38-39
  expires_at: Math.floor(Date.now() / 1000) + 3600, // 1hr placeholder
  ```
- **Recommendation**: 從 JWT payload decode 取得真實的 `exp`，或移除此欄位。

---

## CR-13
- **Severity**: P2
- **File**: `packages/api-server/src/adapters/AnthropicAdapter.ts:109`
- **Title**: Anthropic streaming chunk id 不穩定 — 每個 chunk 用不同 id
- **Description**: OpenAI 規範中，同一 streaming 回應的所有 chunk 應共享同一個 `id`。但 AnthropicAdapter 每個 `content_block_delta` 都用 `chatcmpl-${Date.now()}` 產生不同 id。OpenAI SDK 可能用 id 做 dedup 或 grouping。
- **Evidence**:
  ```typescript
  // AnthropicAdapter.ts:109
  id: `chatcmpl-${Date.now()}`,
  ```
- **Recommendation**: 在 `message_start` 事件取得 Anthropic message id，存為 instance state，後續 chunk 共用。或在 `createTransformedSSEStream` 層產生固定 completion id 傳入。

---

## CR-14
- **Severity**: P2
- **File**: `packages/api-server/src/index.ts:46-48`
- **Title**: /usage 路由掛載了空的 Hono instance — 死碼
- **Description**: `index.ts:47` 建立 `const usage = new Hono()`，未掛任何 route 或 middleware。`/usage/*` 的所有請求進入空 router 後 fallthrough 到 404。實際 `/v1/usage/summary` 透過 proxy routes 提供，這段掛載完全是死碼。
- **Evidence**:
  ```typescript
  // index.ts:46-48
  const usage = new Hono()
  app.route('/usage', usage)
  ```
- **Recommendation**: 移除死碼。

---

## CR-15
- **Severity**: P2
- **File**: `packages/api-server/src/routes/proxy.ts:40`
- **Title**: JSON body parse 失敗時回傳 500 而非 400
- **Description**: `c.req.json()` 如果 body 不是 valid JSON 會拋出異常，被 global error handler 捕捉後回傳 `500 internal_error`。正確行為應是 `400 invalid_request`。
- **Evidence**:
  ```typescript
  // proxy.ts:40
  const body = await c.req.json<OpenAIRequest>()  // 沒有 try-catch
  ```
- **Recommendation**: 包 try-catch，parse 失敗時回傳 400。

---

## CR-16
- **Severity**: P2
- **File**: `packages/api-server/src/services/RouterService.ts:178-179`
- **Title**: GET /v1/models 的 created 欄位每次都是當前時間
- **Description**: `created: Math.floor(Date.now() / 1000)` 讓每次呼叫回傳的 `created` 都不同。OpenAI SDK 可能用此欄位做 cache key，每次不同會造成不必要的 cache miss。
- **Evidence**:
  ```typescript
  // RouterService.ts:178
  created: Math.floor(Date.now() / 1000),
  ```
- **Recommendation**: 使用固定的 timestamp 或 route_config 的 `updated_at`。

---

## CR-17
- **Severity**: P2
- **File**: `packages/api-server/src/middleware/adminAuth.ts:5-7`
- **Title**: ADMIN_EMAILS 未設定時無任何提示 — admin 功能靜默不可用
- **Description**: `ADMIN_EMAILS` 預設空字串，split 後得到空陣列。部署時忘記設定此環境變數，所有 admin 請求被拒，沒有任何 startup warning。
- **Evidence**:
  ```typescript
  // adminAuth.ts:7
  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  ```
- **Recommendation**: 在 app 啟動時檢查並輸出 warning log。

---

## CR-18
- **Severity**: P2
- **File**: `packages/api-server/src/services/RouterService.ts:250-252`
- **Title**: SSE 解析空 catch 靜默吞掉所有 JSON parse 錯誤 — 極難 debug
- **Description**: `createTransformedSSEStream` 內的 catch block 只有 `// Skip unparseable chunks` 註解。如果上游 SSE 格式有系統性問題，所有 chunk 都會被吞掉，沒有任何 log。
- **Evidence**:
  ```typescript
  // RouterService.ts:250-252
  } catch {
    // Skip unparseable chunks
  }
  ```
- **Recommendation**: 加入 `console.warn` 記錄被跳過的 chunk 內容（truncated）。

---

## CR-19
- **Severity**: P2
- **File**: `packages/api-server/src/services/KeyService.ts:121-123`
- **Title**: listKeys 的 key_hash 排除邏輯是無效代碼
- **Description**: `.select()` 已明確列出欄位（不包含 `key_hash`），回傳的 data 本來就沒有 `key_hash`。但第 121-123 行又做一次 destructuring 排除 `key_hash`，是多餘的 type gymnastics。
- **Evidence**:
  ```typescript
  // KeyService.ts:112
  .select('id, user_id, name, prefix, status, quota_tokens, created_at')
  // KeyService.ts:121-123 — 排除已經不存在的欄位
  return (data as Record<string, unknown>[]).map(
    ({ key_hash: _removed, ...rest }) => rest as unknown as ApiKeyRecord
  )
  ```
- **Recommendation**: 直接 `return data as ApiKeyRecord[]`。

---

## CR-20
- **Severity**: P2
- **File**: `packages/api-server/src/__tests__/integration.test.ts`（全檔）
- **Title**: 整合測試覆蓋率極低 — 只測 auth 拒絕路徑
- **Description**: 整合測試只有 4 個 test case，全部是 negative path（health check、401 拒絕、404 格式）。核心的 proxy 成功路徑、streaming、quota 流程、admin 操作完全沒有整合測試。proxy.test.ts 的 unit test mock 了所有 service，不算整合測試。
- **Evidence**: integration.test.ts 共 115 行，4 個 test case。
- **Recommendation**: 補充 proxy 成功路徑、streaming 端對端、quota exhausted 等整合測試場景。

---

## CR-21
- **Severity**: P2
- **File**: `packages/web-admin/src/app/admin/(protected)/dashboard/page.tsx:22-29`
- **Title**: Dashboard getToken() 中 router.push 後仍 throw — UI 閃爍
- **Description**: `getToken()` 在 session 不存在時先 `router.push('/admin/login')` 然後 `throw new Error('Not authenticated')`。throw 會被 caller 的 catch 接住並設定 error state，導致使用者同時看到錯誤訊息和導向登入頁的閃爍。
- **Evidence**:
  ```typescript
  // dashboard/page.tsx:24-27
  if (!data.session) {
    router.push('/admin/login')
    throw new Error('Not authenticated')
  }
  ```
- **Recommendation**: 只 `router.push` + `return '' as never`，或在 error handler 中特判不顯示此 error。

---

## CR-22
- **Severity**: P2
- **File**: `packages/api-server/src/services/KeyService.ts:55`
- **Title**: API Key prefix 長度只有 8 字元 — 辨識度不足
- **Description**: `prefix = plainKey.slice(0, 8)` 取前 8 字元 → `apx-sk-x`（prefix `apx-sk-` 佔 7 字元，只有 1 個隨機字元）。辨識度極低，管理多把 key 時幾乎無法區分。
- **Evidence**:
  ```typescript
  // KeyService.ts:55
  const prefix = plainKey.slice(0, 8)  // "apx-sk-" (7) + 1 random char
  ```
- **Recommendation**: 改為 `slice(0, 14)` 或 `slice(0, 16)`，確保有足夠隨機字元供辨識。

---

## 統計摘要

| 等級 | 數量 |
|------|------|
| P0 | 2 |
| P1 blocking | 4 |
| P1 recommended | 5 |
| P2 | 11 |
| **合計** | **22** |

### P0（核心功能完全壞掉）
1. **CR-1**: Anthropic URL 重複 /v1 → apex-smart 全部 404
2. **CR-2**: Gemini streaming type mismatch → apex-cheap streaming 全部靜默丟棄

### P1 blocking（顯著功能缺陷）
3. **CR-3**: Anthropic finish_reason 未映射 → 破壞 OpenAI SDK 相容性
4. **CR-4**: SQL function 未定義 → quota RPC 與 admin list 全部 500
5. **CR-5**: usage_logs 缺 user_id → admin usage-logs 篩選報錯
6. **CR-6**: usage/summary 忽略 period 參數 → 違反 API 契約

### 結論

**兩個 P0 + 四個 P1 blocking = 此系統目前不具備上線條件。**

CR-1 導致 Anthropic（apex-smart）所有請求 404。CR-2 導致 Gemini（apex-cheap）streaming 無內容輸出。CR-4 導致 quota 機制與 admin 列表全部 500。即使修好 URL 和 streaming 問題，quota 系統也因 SQL function 缺失而無法運作。

建議修復優先順序：CR-4 → CR-1 → CR-2 → CR-3 → CR-5 → CR-6，然後處理 P1 recommended 項目。
