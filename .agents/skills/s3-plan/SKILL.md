---
name: s3-plan
description: "S3 執行計畫 - 產出波次化實作計畫。僅在 SOP 管線內使用。觸發：S2 完成後自動進入"
tags: [adapter-wrapper]
---

# s3-plan

> Adapter skill — 單一真相來源在 `.claude/commands/s3-plan.md`

讀取並執行 `.claude/commands/s3-plan.md`。

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
