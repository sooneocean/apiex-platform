---
name: debug
description: "Debug 輔助 — 針對錯誤進行根因分析與修復建議。觸發：runtime 錯誤、build 失敗、測試失敗"
tags: [adapter-wrapper]
---

# debug

> Adapter skill — 單一真相來源在 `.claude/commands/debug.md`

讀取並執行 `.claude/commands/debug.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
