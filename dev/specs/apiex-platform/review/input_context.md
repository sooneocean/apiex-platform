# S5 Code Review Input Context

## Review Standards

### Scope
S5 Scoped Diff — 審查 SOP apiex-platform 的 S4 實作（80+ files, all new）。

### Criteria
1. **功能正確性**：是否符合 S1 API Spec 的契約（endpoints, request/response format, error codes）
2. **架構一致性**：是否符合 S1 dev_spec 的技術方案（adapter pattern, 樂觀預扣, SSE streaming）
3. **安全性**：API Key hash、RLS、admin auth、secrets 不外洩
4. **錯誤處理**：OpenAI 相容錯誤格式、timeout、upstream error
5. **程式碼品質**：無 dead code、合理的 type safety、edge case 處理

### Severity
- **P0**：功能完全壞掉（無法使用核心功能）
- **P1 blocking**：顯著功能缺陷（部分流程不正確）
- **P1 recommended**：強烈建議修改但不阻斷
- **P2**：小問題、死碼、可讀性

---

## Output Format

產出結構化 findings，每條包含：
- ID: CR-{N}
- Severity: P0 / P1 / P2
- File: 檔案路徑:行號
- Title: 問題標題
- Description: 問題描述
- Evidence: 程式碼引用
- Recommendation: 建議修正方式

---

## S0 Success Criteria

1. OpenAI SDK 僅替換 base_url 和 api_key，零程式碼修改可呼叫成功
2. apex-smart / apex-cheap 路由到正確上游模型
3. Streaming 模式格式與 OpenAI 完全相容
4. 上游 timeout 時回傳 502，不讓請求無限懸掛
5. 額度為 0 時回傳 402，不透傳到上游
6. 所有請求（成功/失敗）均寫入 usage_logs

## S1 API Spec Summary

### Endpoints
- POST /v1/chat/completions (API Key auth) — model: apex-smart|apex-cheap, stream: bool
- GET /v1/models (API Key auth)
- POST /auth/login — access_token validation
- GET /keys (JWT auth) — list user keys (masked)
- POST /keys (JWT auth) — create key, rate limit 1/sec
- DELETE /keys/:id (JWT auth) — revoke key
- GET /usage/summary (API Key auth) — period filter: 24h|7d|30d|all
- GET /admin/users (Admin auth) — paginated user list
- PATCH /admin/users/:id/quota (Admin auth) — set quota
- GET /admin/usage-logs (Admin auth) — filtered+paginated logs

### Error Codes
- 400 unsupported_model
- 401 invalid_api_key / invalid_token
- 402 quota_exhausted
- 403 admin_required
- 429 rate_limit
- 502 upstream_timeout / upstream_error
- 503 route_not_configured

---

## Key Source Files

### packages/api-server/src/routes/proxy.ts
- POST /chat/completions pipeline: validate model → reserveQuota → resolveRoute → forward → settleQuota + logUsage
- GET /models — list active models
- GET /usage/summary — usage statistics

### packages/api-server/src/services/RouterService.ts
- resolveRoute(tag) → query route_config
- forward(route, body, stream) → adapter.transformRequest → fetch upstream → adapter.transformResponse/transformStreamChunk
- createTransformedSSEStream() — parse upstream SSE, transform via adapter, accumulate usage
- Timeout: non-streaming 30s, streaming 120s

### packages/api-server/src/services/KeyService.ts
- createKey() — generate apx-sk-{base64url(32)}, sha256 hash, store in DB
- validateKey() — lookup by key_hash + active status
- reserveQuota() — RPC call to reserve_quota SQL function
- settleQuota() — RPC call to settle_quota SQL function

### packages/api-server/src/adapters/AnthropicAdapter.ts
- transformRequest: OpenAI format → Anthropic format (extract system, rename fields)
- transformResponse: Anthropic format → OpenAI format
- transformStreamChunk: Handle 8 event types (message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop, ping, error)

### packages/api-server/src/adapters/GeminiAdapter.ts
- transformRequest: passthrough with model replacement
- transformResponse: normalize finish_reason (uppercase→lowercase), normalize id prefix
- transformStreamChunk: normalize streaming chunks

### packages/api-server/src/middleware/apiKeyAuth.ts
- Extract Bearer token, verify apx-sk- prefix, sha256 hash lookup

### packages/api-server/src/middleware/adminAuth.ts
- supabaseJwtAuth: verify JWT via Supabase
- adminAuth: verify JWT + check email whitelist

### packages/api-server/src/lib/errors.ts
- OpenAI-compatible error format
- Error classes: ApiError, AuthenticationError, InvalidRequestError, InsufficientQuotaError, ServerError
- Errors factory object with all error types

### packages/api-server/supabase/migrations/20260314000000_init_schema.sql
- Tables: api_keys, user_quotas, usage_logs, route_config
- RLS policies for all tables
- Seed data: apex-smart → anthropic/claude-opus-4-6, apex-cheap → google/gemini-2.0-flash

### packages/api-server/src/index.ts
- Hono app with CORS, routes mounting, global error handler
- Route structure: /v1/* (apiKeyAuth), /auth/*, /keys/* (supabaseJwtAuth), /admin/* (adminAuth)

---

## Critical Code Sections to Review

### 1. Route Config Seed Data vs RouterService.forward() URL Construction
Seed: `upstream_base_url = 'https://api.anthropic.com/v1'`
RouterService.forward(): `endpoint = ${baseUrl}/v1/messages` for anthropic
Result: `https://api.anthropic.com/v1/v1/messages` — double /v1

### 2. GeminiAdapter.transformStreamChunk() Type Mismatch
RouterService.createTransformedSSEStream() JSON.parses data before passing to adapter.
GeminiAdapter.transformStreamChunk() treats chunk.data as string and tries JSON.parse again.
This causes all Gemini streaming chunks to be silently dropped (caught by empty catch block).

### 3. AnthropicAdapter.transformResponse() finish_reason Mapping
Anthropic uses `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`.
OpenAI uses `stop`, `length`, `content_filter`, `tool_calls`.
No mapping is done — breaks OpenAI SDK compatibility.

### 4. Usage Summary Missing Period Filter
GET /v1/usage/summary accepts `period` param but implementation ignores it — fetches ALL logs.

### 5. Missing Request Body Validation
POST /v1/chat/completions doesn't validate `messages` (required, ≥1).

### 6. usage_logs Table Missing user_id Column
admin.ts:99 filters `query.eq('user_id', userId)` but usage_logs has no user_id column.
