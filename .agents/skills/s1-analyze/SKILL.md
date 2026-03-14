---
name: s1-analyze
description: "S1 技術分析 — 探索 codebase 並產出 dev_spec。觸發：S0 確認後自動進入、「分析影響範圍」"
tags: [adapter-wrapper]
---

# s1-analyze

> Adapter skill — 單一真相來源在 `.claude/commands/s1-analyze.md`

讀取並執行 `.claude/commands/s1-analyze.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
