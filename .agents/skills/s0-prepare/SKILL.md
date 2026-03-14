---
name: s0-prepare
description: "S0 前置準備 — 互動式引導填寫需求模板，完成後用 Mode A 快速進入 S0。觸發：「準備需求」「填需求」「prepare」"
tags: [adapter-wrapper]
---

# s0-prepare

> Adapter skill — 單一真相來源在 `.claude/commands/s0-prepare.md`

讀取並執行 `.claude/commands/s0-prepare.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
