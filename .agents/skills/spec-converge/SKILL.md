---
name: spec-converge
description: "Spec 收斂迴圈 — Codex 審查 + Claude 修正，迭代至 P0=P1=P2=0。觸發：「收斂 spec」「converge spec」"
tags: [adapter-wrapper]
---

# spec-converge

> Adapter skill — 單一真相來源在 `.claude/commands/spec-converge.md`

讀取並執行 `.claude/commands/spec-converge.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
