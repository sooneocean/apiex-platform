---
name: handoff
description: "對話過場 — 整理當前對話上下文與下一步，用於跨視窗橋接。觸發：「handoff」「過場」"
tags: [adapter-wrapper]
---

# handoff

> Adapter skill — 單一真相來源在 `.claude/commands/handoff.md`

讀取並執行 `.claude/commands/handoff.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
