---
name: apiex
description: Apiex AI API gateway — route requests to the best AI model via apex-smart or apex-cheap tags
---

# Apiex

AI API 中轉平台。透過 `apex-smart`（頂尖模型）或 `apex-cheap`（高性價比模型）路由標籤，自動將請求轉發到最佳 AI 模型。

## Tools

### apiex_chat

Send a chat completion request through Apiex.

**Parameters:**
- `model` (required): Model routing tag — `apex-smart` or `apex-cheap`
- `messages` (required): Chat messages in OpenAI format

**Example:**
```json
{
  "model": "apex-smart",
  "messages": [
    {"role": "user", "content": "Explain quantum computing in 2 sentences"}
  ]
}
```

### apiex_models

List available models on Apiex. No parameters needed.

### apiex_usage

Get your usage summary.

**Parameters:**
- `period` (optional): Time window — `24h`, `7d`, `30d`, or `all`

## Setup

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "apiex": {
      "command": "npx",
      "args": ["@apiex/mcp"],
      "env": {
        "APIEX_API_KEY": "apx-sk-your-key-here"
      }
    }
  }
}
```

## Model Tags

| Tag | Strategy | Current Model |
|-----|----------|---------------|
| `apex-smart` | Best available | Claude Opus 4.6 |
| `apex-cheap` | Cost-effective | Gemini 2.0 Flash |
