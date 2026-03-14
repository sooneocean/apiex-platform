---
name: audit-fix
description: "Audit-Fix 迴圈 — Codex 審計 spec vs codebase 差距，再 Codex 修復。可反覆觸發持續收斂。觸發：「audit fix」「審計修復」「codex 審計」「找問題修」「audit-fix」"
tags: [adapter-wrapper]
---

# audit-fix

> Adapter skill — 單一真相來源在 `.claude/commands/audit-fix.md`

讀取並執行 `.claude/commands/audit-fix.md`。

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
