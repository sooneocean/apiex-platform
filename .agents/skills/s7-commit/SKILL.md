---
name: s7-commit
description: "S7 提交階段 - 整理變更並提交。僅在 SOP 管線內使用。觸發：S6 通過後進入、「提交」、「commit」"
tags: [adapter-wrapper]
---

# s7-commit

> Adapter skill — 單一真相來源在 `.claude/commands/s7-commit.md`

讀取並執行 `.claude/commands/s7-commit.md`。

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
