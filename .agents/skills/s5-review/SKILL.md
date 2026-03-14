---
name: s5-review
description: "S5 Code Review — 對抗式驗證實作是否符合 Spec。觸發：S4 完成後自動進入"
tags: [adapter-wrapper]
---

# s5-review

> Adapter skill — 單一真相來源在 `.claude/commands/s5-review.md`

讀取並執行 `.claude/commands/s5-review.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
