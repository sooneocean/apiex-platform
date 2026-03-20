# Apiex Platform — 自架式 AI API 閘道器

> 語意模型路由、配額管理、花費追蹤、完整可觀測性。一個平台管理所有 AI API。

把 OpenAI SDK 的 `base_url` 和 `api_key` 指向 Apiex，立即獲得自動模型路由、per-key 花費上限、Webhook 通知和分析儀表板。

---

## 目錄

- [功能總覽](#功能總覽)
- [系統架構](#系統架構)
- [技術棧](#技術棧)
- [快速開始](#快速開始)
- [環境變數](#環境變數)
- [使用方式](#使用方式)
  - [作為 OpenAI 替代品](#作為-openai-替代品)
  - [命令列工具 (CLI)](#命令列工具-cli)
  - [MCP Server](#mcp-server)
  - [管理後台](#管理後台)
  - [用戶入口](#用戶入口)
- [API 端點一覽](#api-端點一覽)
- [模型路由機制](#模型路由機制)
- [配額與花費管理](#配額與花費管理)
- [Webhook 通知](#webhook-通知)
- [速率限制](#速率限制)
- [Stripe 儲值](#stripe-儲值)
- [可觀測性](#可觀測性)
- [Docker 部署](#docker-部署)
- [開發指南](#開發指南)
- [專案結構](#專案結構)
- [版本歷程](#版本歷程)
- [授權](#授權)

---

## 功能總覽

| 功能 | 說明 |
|------|------|
| **OpenAI 相容代理** | `/v1/chat/completions`，支援串流 (SSE) |
| **語意模型路由** | `apex-smart` / `apex-cheap` 標籤，管理員即時切換目標模型 |
| **多供應商轉接** | Anthropic Claude + Google Gemini → 統一 OpenAI 格式輸出 |
| **原子配額管理** | Supabase RPC reserve/settle，並發場景不超扣 |
| **per-Key 花費上限** | 美元計價花費追蹤，超額自動回傳 402 |
| **速率限制** | 滑動窗口 RPM/TPM，三階分層 (free/pro/unlimited) |
| **Webhook 通知** | 4 種事件、HMAC-SHA256 簽章、SSRF 防護、1 小時去重 |
| **Stripe 自助儲值** | Checkout Session → Webhook → 自動加值配額 |
| **分析儀表板** | 時序圖、延遲百分位 (p50/p95/p99)、模型分布、帳單明細 |
| **管理 + 用戶介面** | Next.js 16 App Router、Tailwind CSS v4、中英雙語 (zh-TW/en) |
| **命令列工具** | TypeScript 版 + Rust 版（獨立 binary，13ms 啟動） |
| **MCP Server** | 讓 AI Agent 直接操作平台 API |
| **結構化日誌** | JSON 格式輸出，相容 CloudWatch / Datadog / ELK |
| **API 版本控制** | 所有回應含 `X-API-Version` header |

---

## 系統架構

```
                         ┌─────────────────────────────┐
                         │       Client / SDK          │
                         │  (OpenAI Python/JS/Rust)    │
                         └─────────────┬───────────────┘
                                       │ POST /v1/chat/completions
                                       ▼
┌──────────────────────────────────────────────────────────────┐
│                     API Server (Hono.js)                     │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ API Key  │→ │ Rate Limiter │→ │   Router Service       │ │
│  │ Auth     │  │ (RPM / TPM)  │  │ apex-smart → Claude    │ │
│  │ (Bearer) │  │              │  │ apex-cheap → Gemini    │ │
│  └──────────┘  └──────────────┘  └───────────┬────────────┘ │
│                                               │              │
│  ┌─────────────────────┐  ┌──────────────────┼────────────┐ │
│  │ Quota Management    │  │  Provider Adapters             │ │
│  │ reserve → forward → │  │  ┌───────────┐ ┌────────────┐ │ │
│  │ settle (atomic RPC) │  │  │ Anthropic │ │   Gemini   │ │ │
│  └─────────────────────┘  │  │ Adapter   │ │   Adapter  │ │ │
│                           │  └───────────┘ └────────────┘ │ │
│  ┌─────────────────────┐  └───────────────────────────────┘ │
│  │ Post-Processing     │                                    │
│  │ • settleQuota       │  ┌────────────────────────────────┐│
│  │ • logUsage          │  │      Webhook Service           ││
│  │ • recordSpend       │  │ quota_warning / exhausted      ││
│  │ • checkNotify       │  │ spend_warning / limit_reached  ││
│  └─────────────────────┘  └────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
         │                        │                    │
         ▼                        ▼                    ▼
   ┌──────────┐           ┌──────────────┐     ┌─────────────┐
   │ Supabase │           │    Stripe    │     │   Upstash   │
   │ (PG+Auth)│           │  (Payments)  │     │   (Redis)   │
   └──────────┘           └──────────────┘     └─────────────┘
```

### Monorepo 結構

```
pnpm monorepo (turborepo)
├── packages/api-server    # Hono.js 後端 (Node.js, ESM)
├── packages/web-admin     # Next.js 16 管理 + 用戶介面
├── packages/cli           # TypeScript CLI (Commander.js)
├── packages/cli-rs        # Rust CLI (獨立 binary, 4.2MB, 13ms 啟動)
├── packages/mcp-server    # MCP Server (@modelcontextprotocol/sdk)
└── supabase/              # Migrations + RPC functions
```

---

## 技術棧

| 層 | 技術 |
|----|------|
| 後端框架 | [Hono](https://hono.dev/) (Node.js, ESM) |
| 前端框架 | [Next.js 16](https://nextjs.org/) App Router |
| 樣式 | [Tailwind CSS v4](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) |
| 圖表 | [Recharts](https://recharts.org/) (動態載入) |
| 資料庫 | [Supabase](https://supabase.com/) (PostgreSQL + Auth + RLS + RPC) |
| 付款 | [Stripe](https://stripe.com/) Checkout + Webhook |
| 快取/限流 | [Upstash Redis](https://upstash.com/) (可選，降級至記憶體) |
| 追蹤 | [OpenTelemetry](https://opentelemetry.io/) + OTLP Export |
| CLI | TypeScript (Commander.js) + Rust (clap + reqwest + tokio) |
| MCP | [@modelcontextprotocol/sdk](https://modelcontextprotocol.io/) |
| 建置 | pnpm 10 + Turborepo + tsup |
| 測試 | vitest 4 |

---

## 快速開始

### 前置需求

- Node.js 22+
- pnpm 10+
- Supabase 專案（免費方案即可）
- Anthropic 或 Google AI API Key（至少一個）

### 安裝

```bash
# 複製專案
git clone https://github.com/sooneocean/apiex-platform.git
cd apiex-platform

# 安裝依賴
pnpm install

# 設定環境變數
cp .env.example .env
# 編輯 .env，填入 Supabase、API Key、Stripe 等資訊

# 執行資料庫遷移
npx supabase db push

# 啟動開發伺服器
pnpm dev
```

啟動後：
- API Server: `http://localhost:3000`
- Web Admin: `http://localhost:3001`

---

## 環境變數

| 變數 | 必填 | 說明 |
|------|------|------|
| `SUPABASE_URL` | 是 | Supabase 專案 URL |
| `SUPABASE_ANON_KEY` | 是 | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | Supabase service role key |
| `ADMIN_EMAILS` | 是 | 管理員 email（逗號分隔） |
| `ANTHROPIC_API_KEY` | 是* | Anthropic API Key（*至少一個供應商） |
| `GOOGLE_AI_API_KEY` | 是* | Google AI API Key（*至少一個供應商） |
| `STRIPE_SECRET_KEY` | 否 | Stripe Secret Key（儲值功能） |
| `STRIPE_WEBHOOK_SECRET` | 否 | Stripe Webhook 簽章密鑰 |
| `UPSTASH_REDIS_REST_URL` | 否 | Upstash Redis URL（分散式限流） |
| `UPSTASH_REDIS_REST_TOKEN` | 否 | Upstash Redis Token |
| `NEXT_PUBLIC_API_URL` | 是 | API Server URL（前端用） |
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | Supabase URL（前端用） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | Supabase Anon Key（前端用） |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | 否 | OpenTelemetry OTLP 端點（如 `http://jaeger:4318`） |

---

## 使用方式

### 作為 OpenAI 替代品

任何支援 OpenAI SDK 的應用程式，只需修改兩個參數：

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-apiex.example.com/v1",
    api_key="apx-sk-your-key-here"
)

response = client.chat.completions.create(
    model="apex-smart",   # 自動路由到最佳模型
    messages=[{"role": "user", "content": "你好！"}]
)
print(response.choices[0].message.content)
```

```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: 'https://your-apiex.example.com/v1',
  apiKey: 'apx-sk-your-key-here',
})

const res = await client.chat.completions.create({
  model: 'apex-cheap',   // 路由到經濟模型
  messages: [{ role: 'user', content: '你好！' }],
})
```

### 命令列工具 (CLI)

**TypeScript 版**（需 Node.js）：
```bash
npm i -g @sooneocean/apiex-cli
apiex login           # 認證
apiex chat --model apex-smart "解釋量子計算"
apiex keys list       # 列出 API Keys
apiex keys create --name "my-key"
apiex status          # 查看模型和用量
apiex status --json   # JSON 格式輸出
apiex logout          # 登出
```

**Rust 版**（獨立 binary，零依賴，13ms 啟動）：
```bash
cd packages/cli-rs
cargo build --release
./target/release/apiex --help
```

功能完全對等，指令相同。Config 共用 `~/.apiex/config.json`。

### MCP Server

讓 Claude Desktop 或其他 AI Agent 直接操作平台：

```json
{
  "mcpServers": {
    "apiex": {
      "command": "npx",
      "args": ["@sooneocean/apiex-mcp"]
    }
  }
}
```

提供三個工具：
- `apiex_chat` — 發送聊天請求
- `apiex_models` — 列出可用模型
- `apiex_usage` — 查看用量摘要

### 管理後台

路徑：`/admin`（需 `ADMIN_EMAILS` 中的帳號登入）

| 頁面 | 功能 |
|------|------|
| Dashboard | 用戶列表、API Key 管理、配額調整 |
| Analytics | 平台級時序圖、延遲分析、Top Users |
| Logs | 用量日誌查詢（含 debounce 搜尋） |
| Models | 路由設定（新增/編輯/啟停模型路由） |
| Routes | 路由管理（tag → provider + upstream_model） |
| Rates | 費率設定（input/output per 1K tokens） |
| Rate Limits | 限流分層管理（RPM/TPM per tier） |
| Webhooks | 全平台 Webhook 設定總覽 |
| Topup Logs | Stripe 儲值記錄 |

### 用戶入口

路徑：`/portal`（一般用戶登入）

| 頁面 | 功能 |
|------|------|
| Dashboard | 個人用量趨勢、模型分布、延遲分析、帳單、配額 |
| Logs | 個人用量日誌 |
| Settings > Webhooks | 設定個人 Webhook 通知 |
| Topup | Stripe 自助儲值 |

---

## API 端點一覽

### 代理端點（需 API Key 認證）

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/v1/chat/completions` | 聊天完成（支援串流） |
| GET | `/v1/models` | 列出可用模型 |
| GET | `/v1/usage/summary` | 用量摘要（含配額） |

### Key 管理端點（需 API Key 認證）

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/keys` | 列出 API Keys |
| POST | `/keys` | 建立 API Key |
| DELETE | `/keys/:id` | 撤銷 API Key |

### Webhook 端點（需 JWT 認證）

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/webhooks` | 取得 Webhook 設定 |
| POST | `/webhooks` | 建立/更新 Webhook 設定 |
| DELETE | `/webhooks/:id` | 刪除 Webhook 設定 |
| GET | `/webhooks/:id/logs` | 推播記錄 |
| POST | `/webhooks/test` | 發送測試推播 |

### 分析端點（需 JWT 認證）

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/analytics/timeseries` | 時序數據 |
| GET | `/analytics/model-breakdown` | 模型分布 |
| GET | `/analytics/latency` | 延遲百分位 |
| GET | `/analytics/billing` | 帳單摘要 |

### 健康檢查

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/health` | 健康狀態 + API 版本 |

所有回應都包含 `X-API-Version` header。

---

## 模型路由機制

Apiex 使用**語意標籤**（semantic tag）做模型路由，而非直接暴露上游模型名稱：

```
用戶請求 model: "apex-smart"
    ↓
RouterService 查詢 route_config 表
    ↓
找到 tag="apex-smart", provider="anthropic", upstream_model="claude-sonnet-4-20250514"
    ↓
透過 AnthropicAdapter 轉發至 Anthropic API
    ↓
回應轉換為 OpenAI 格式回傳
```

**好處**：
- 管理員可以即時切換底層模型（如 Claude Sonnet → Claude Opus），用戶端零改動
- 同一個 tag 可設定多條路由（active/inactive），方便 A/B 切換
- 只接受 `apex-` 前綴的 tag，其他直接回傳 400

---

## 配額與花費管理

### 配額（Quota）

每個 API Key 有一個 `quota_tokens` 欄位：
- **-1** = 無限制
- **正整數** = 剩餘可用 tokens

每次請求的流程：
1. `reserveQuota(estimatedTokens)` — 預扣（原子 RPC）
2. 轉發至上游 LLM
3. `settleQuota(estimated, actual)` — 結算差額（退還多扣）

### 花費（Spend）

每個 API Key 有 `spent_usd` 和 `spend_limit_usd` 欄位：
- 每次請求根據 token 數量和費率計算成本（美分）
- `spend_limit_usd = -1` 表示無上限
- 超過上限自動回傳 402

---

## Webhook 通知

### 支援的事件類型

| 事件 | 觸發條件 |
|------|---------|
| `quota_warning` | 配額剩餘 < 20% |
| `quota_exhausted` | 配額歸零 |
| `spend_warning` | 花費超過上限的 80% |
| `spend_limit_reached` | 花費達到上限 |

### 安全機制

- **HMAC-SHA256 簽章**：若設定 `secret`，每次推播附帶 `X-Webhook-Signature` header
- **SSRF 防護**：禁止推播到私有 IP（完整 IPv4 + IPv6 檢查，含 mapped IPv4）
- **1 小時去重**：同一事件對同一 Key，1 小時內只推播一次
- **超時控制**：10 秒超時，回應最大 1KB
- **Fire-and-forget**：推播不阻塞 API 回應

---

## 速率限制

### 分層系統

| 層級 | RPM | TPM |
|------|-----|-----|
| `free` | 10 | 100,000 |
| `pro` | 100 | 1,000,000 |
| `unlimited` | 無限 | 無限 |

管理員可自訂層級和 override。

### 實作方式

- 滑動窗口演算法（1 分鐘視窗）
- 後端：Upstash Redis（分散式）或記憶體（單機）
- Redis 故障自動降級至記憶體
- 回應 header 包含：`X-RateLimit-Limit-RPM`、`X-RateLimit-Remaining-RPM`、`Retry-After`

---

## Stripe 儲值

### 流程

1. 用戶在 Portal 選擇儲值金額
2. 建立 Stripe Checkout Session
3. 用戶完成付款
4. Stripe Webhook 回調 → `checkout.session.completed`
5. 系統驗證 idempotency（防重複處理）
6. 自動加值配額（金額 → tokens 換算）
7. 記錄儲值記錄

### 設定

需要在 Stripe Dashboard 設定 Webhook endpoint 指向 `/stripe/webhook`。

---

## 可觀測性

### 結構化日誌

所有日誌以 JSON 格式輸出，每行包含：

```json
{
  "level": "info",
  "ts": "2026-03-21T10:00:00.000Z",
  "ctx": "proxy",
  "msg": "fire-and-forget failed",
  "err": { "message": "...", "stack": "..." }
}
```

支援的 context：`proxy`、`admin`、`analytics`、`rate-limiter`、`telemetry`、`webhook`、`usage`、`server`。

### OpenTelemetry 追蹤

設定 `OTEL_EXPORTER_OTLP_ENDPOINT` 環境變數即可啟用：

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

追蹤 span 包含：
- `llm.model`、`llm.provider`
- `llm.total_tokens`、`llm.prompt_tokens`、`llm.completion_tokens`
- `llm.latency_ms`、`llm.stream`

---

## Docker 部署

```bash
# 建置映像
docker build -t apiex-platform .

# 執行
docker run -d \
  --name apiex \
  -p 3000:3000 \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e ANTHROPIC_API_KEY=... \
  apiex-platform
```

Docker 映像特點：
- 基於 `node:22-alpine`（輕量）
- 內建 `HEALTHCHECK`（30 秒間隔檢查 `/health`）
- 以 `node` 用戶執行（非 root）
- 多階段建置，production image 只含 dist + prod deps

---

## 開發指南

```bash
# 執行全部測試
pnpm test

# 執行單一 package 測試
pnpm -F api-server test

# 建置全部
pnpm build

# 型別檢查
pnpm -F web-admin exec npx tsc --noEmit

# Rust CLI 建置
cd packages/cli-rs && cargo build --release
```

### 測試概覽

- 22 個測試檔案、263 個測試案例
- 覆蓋：路由、服務層、中介層、adapter、日誌、API 版本
- 框架：vitest 4（注意 constructor mock 需用 `class {}` 語法）

---

## 專案結構

```
packages/api-server/
  src/
    routes/          # 路由處理（proxy, auth, keys, admin, webhooks, topup, analytics）
    services/        # 業務邏輯（Router, Key, Webhook, Topup, Rates, Aggregation...）
    adapters/        # LLM 供應商轉接器（Anthropic, Gemini）
    middleware/      # 認證、速率限制
    lib/             # Supabase client, Stripe, RateLimiter, Logger

packages/web-admin/
  src/
    app/admin/       # 管理後台（analytics, users, rates, routes, webhooks）
    app/portal/      # 用戶入口（dashboard, topup, settings）
    components/      # 共用 UI 元件（charts, analytics, layout）
    lib/             # API client, Supabase client

packages/cli/        # TypeScript CLI
packages/cli-rs/     # Rust CLI（功能對等，獨立 binary）
packages/mcp-server/ # MCP Server（AI Agent 用）
supabase/migrations/ # 資料庫 Schema（14 個 migration）
```

---

## 版本歷程

| 版本 | 日期 | 重點 |
|------|------|------|
| **v0.6.0** | 2026-03-21 | 三波優化：DB 索引、SSRF 修復、結構化日誌、Dockerfile、獨立載入、type-safe、測試、API 版本 |
| **v0.5.0** | 2026-03-15 | Next.js 16、vitest 4、SDK 升級 |
| **v0.4.0** | 2026-03-15 | Rust CLI、React Query、Dashboard UX |
| **v0.3.0** | 2026-03 | Webhook 通知、OpenTelemetry、API Key 到期 |
| **v0.2.0** | 2026-03 | Stripe 儲值、花費上限、速率限制、分析儀表板 |
| **v0.1.0** | 2026-03 | 初始版本：代理、路由、配額、管理介面、CLI、MCP |

---

## 授權

[MIT](LICENSE)
