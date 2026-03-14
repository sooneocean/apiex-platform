---
name: parallel-develop
description: "並行開發模式 — Git Worktree 同時開發多功能，各自跑 S0→S4 再合併。觸發：「並行開發」「parallel」「worktree」"
tags: [adapter-wrapper]
---

# parallel-develop

> Adapter skill — 單一真相來源在 `.claude/commands/parallel-develop.md`

讀取並執行 `.claude/commands/parallel-develop.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
