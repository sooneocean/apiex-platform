---
name: architecture
description: "系統架構文件 — 分析專案架構並產出 ARCHITECTURE.md。觸發：「架構文件」「architecture」"
tags: [adapter-wrapper]
---

# architecture

> Adapter skill — 單一真相來源在 `.claude/commands/architecture.md`

讀取並執行 `.claude/commands/architecture.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
