# apiex-platform

> Self-hosted AI API Gateway with semantic model routing, quota management, and full observability.

**Drop-in OpenAI replacement** -- change `base_url` and `api_key`, get automatic model routing, per-key spend limits, webhook notifications, and analytics dashboard.

## Features

| Feature | Description |
|---------|-------------|
| **OpenAI-Compatible Proxy** | `/v1/chat/completions` with streaming support |
| **Semantic Model Routing** | `apex-smart` / `apex-cheap` tags, admin hot-swap target models |
| **Multi-Provider Adapters** | Anthropic + Gemini -> OpenAI format SSE conversion |
| **Atomic Quota Management** | Supabase RPC reserve/settle, no concurrent over-deduction |
| **Per-Key Spend Limits** | USD-based spend tracking with automatic 402 cutoff |
| **Rate Limiting** | Sliding window RPM/TPM, tier system (free/pro/unlimited) |
| **Webhook Notifications** | 4 event types, HMAC-SHA256 signing, SSRF protection, 1h dedup |
| **Stripe Self-Service Topup** | Checkout session, idempotent webhook, auto quota credit |
| **Analytics Dashboard** | Timeseries, latency percentiles (p50/p95/p99), top users, billing |
| **Admin + Portal UI** | Next.js 15 App Router, Tailwind CSS, i18n (zh-TW/en) |
| **CLI** | `apiex login`, `apiex chat`, `apiex keys`, `apiex status` |
| **MCP Server** | `apiex_chat`, `apiex_models`, `apiex_usage` for AI agents |

## Architecture

```
pnpm monorepo (turbo)
├── packages/api-server    # Hono.js backend (Node.js, ESM)
├── packages/web-admin     # Next.js 15 admin + portal UI
├── packages/cli           # Commander.js CLI
├── packages/mcp-server    # MCP Server (@modelcontextprotocol/sdk)
└── supabase/              # Migrations + RPC functions
```

**Stack**: TypeScript, Hono, Next.js 15, Supabase (Auth + DB + RLS + RPC), Stripe, Recharts

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase project (free tier works)
- Anthropic or Google AI API key

### Setup

```bash
# Clone
git clone https://github.com/your-org/apiex-platform.git
cd apiex-platform

# Install
pnpm install

# Configure
cp .env.example .env
# Edit .env with your Supabase, API keys, and Stripe credentials

# Run Supabase migrations
npx supabase db push

# Development
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `ADMIN_EMAILS` | Yes | Comma-separated admin email list |
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key (*at least one provider) |
| `GOOGLE_AI_API_KEY` | Yes* | Google AI API key (*at least one provider) |
| `STRIPE_SECRET_KEY` | No | Stripe secret key (for topup feature) |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis URL (for distributed rate limiting) |
| `NEXT_PUBLIC_API_URL` | Yes | API server URL for frontend |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase URL for frontend |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key for frontend |

## Usage

### As an OpenAI drop-in replacement

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-apiex.fly.dev/v1",
    api_key="apx-sk-your-key"
)

response = client.chat.completions.create(
    model="apex-smart",  # routes to the best available model
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### CLI

```bash
apiex login
apiex chat --model apex-smart "Explain quantum computing"
apiex keys list
apiex status
```

### MCP Server

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "apiex": {
      "command": "node",
      "args": ["path/to/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## Development

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @apiex/api-server test

# Build all packages
pnpm build

# Type check
pnpm --filter @apiex/web-admin exec npx tsc --noEmit
```

## Project Structure

```
packages/api-server/
  src/
    routes/          # Hono route handlers (proxy, auth, keys, admin, webhooks, topup)
    services/        # Business logic (RouterService, KeyService, WebhookService, etc.)
    adapters/        # LLM provider adapters (Anthropic, Gemini)
    middleware/      # Auth, rate limiting
    lib/             # Supabase client, Stripe, rate limiter

packages/web-admin/
  src/
    app/admin/       # Admin portal (analytics, users, rates, routes, webhooks)
    app/portal/      # User portal (dashboard, topup, settings)
    components/      # Shared UI components
    lib/             # API client, Supabase client

packages/cli/        # CLI tool
packages/mcp-server/ # MCP Server for AI agents
supabase/migrations/ # Database schema
```

## AI-Assisted Development

This project includes a complete AI-assisted development workflow in `.claude/`:

- **S0-S7 SOP Pipeline**: requirement analysis -> architecture -> spec review -> implementation -> code review -> testing -> commit
- **11 Specialized Agents**: architect, codebase-explorer, reviewer, test-engineer, frontend-developer, etc.
- **30+ Commands**: cross-validate, spec-audit, debug, explore, parallel-develop, etc.

See `.claude/` directory for the full framework.

## License

[MIT](LICENSE)
