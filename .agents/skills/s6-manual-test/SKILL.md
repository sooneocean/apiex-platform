---
name: s6-manual-test
description: "S6 手動測試引導 — 互動式逐案引導手動 TC 測試，支援斷點續測。觸發：「手動測試」「manual test」"
tags: [adapter-wrapper]
---

# s6-manual-test

> Adapter skill — 單一真相來源在 `.claude/commands/s6-manual-test.md`

讀取並執行 `.claude/commands/s6-manual-test.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
