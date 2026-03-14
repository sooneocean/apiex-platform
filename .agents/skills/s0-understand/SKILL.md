---
name: s0-understand
description: "S0 需求討論 - 互動式理解需求並產出需求共識。觸發：「開始SOP:」、「我想要」、「幫我做」、「新增功能」、新需求描述。不用於簡單問答或查詢。"
tags: [adapter-wrapper]
aliases: [s0, 需求, understand, 開始SOP]
---

# s0-understand

> Adapter skill — 單一真相來源在 `.claude/commands/s0-understand.md`

讀取並執行 `.claude/commands/s0-understand.md`。

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
