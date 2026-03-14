---
name: s6-test
description: "S6 測試階段 - 執行測試與缺陷閉環修復。僅在 SOP 管線內使用。觸發：S5 通過且用戶確認後進入、「測試」、「驗收」"
tags: [adapter-wrapper]
---

# s6-test

> Adapter skill — 單一真相來源在 `.claude/commands/s6-test.md`

讀取並執行 `.claude/commands/s6-test.md`。

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
