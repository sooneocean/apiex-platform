---
name: cross-validate
description: "多視角交叉驗證 — 並行多個 Agent 從不同角度分析程式碼。觸發：「交叉驗證」「cross validate」「xval」"
tags: [adapter-wrapper]
---

# cross-validate

> Adapter skill — 單一真相來源在 `.claude/commands/cross-validate.md`

讀取並執行 `.claude/commands/cross-validate.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
