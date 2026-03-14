---
name: apiex
description: "Apiex AI API — 使用 apex-smart（最強模型）或 apex-cheap（最省模型）呼叫 AI。觸發關鍵字：apex-smart, apex-cheap, apiex"
---

# Apiex — AI API Gateway

Apiex 是一個 AI API Gateway，提供統一的 OpenAI-compatible API 介面，透過 model routing tag 自動導向最適合的 AI 模型。

## Model Tags

| Tag | 用途 | 說明 |
|-----|------|------|
| `apex-smart` | 最強模型 | 路由到當前可用的最高品質模型，適合複雜推理 |
| `apex-cheap` | 最省模型 | 路由到最具成本效益的模型，適合簡單任務 |

## MCP 設定

在 Claude Desktop 或其他 MCP client 中加入：

```json
{
  "mcpServers": {
    "apiex": {
      "command": "npx",
      "args": ["@apiex/mcp"],
      "env": {
        "APIEX_API_KEY": "your-api-key",
        "APIEX_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

## 環境變數

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `APIEX_API_KEY` | API 金鑰 | 無（必填或用 `~/.apiex/config.json`） |
| `APIEX_BASE_URL` | API 基底 URL | `http://localhost:3000` |

## MCP Tools

### apiex_chat
發送 chat completion 請求。

參數：
- `model` (string, required): Model routing tag（`apex-smart` 或 `apex-cheap`）
- `messages` (array, required): 聊天訊息陣列，每個元素包含 `role` 和 `content`

### apiex_models
列出所有可用模型。無參數。

### apiex_usage
查詢使用量摘要。

參數：
- `period` (string, optional): 時間範圍篩選（如 `7d`、`30d`）

## CLI 使用

```bash
# 登入
apiex login

# 查看狀態
apiex status

# 聊天
apiex chat --model apex-smart "解釋量子計算"

# 管理 API Keys
apiex keys list
apiex keys create --name my-key
apiex keys revoke <key-id>
```

## cURL 範例

```bash
# Chat Completion
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "apex-smart",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# List Models
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"

# Usage Summary
curl http://localhost:3000/usage/summary \
  -H "Authorization: Bearer YOUR_API_KEY"
```
