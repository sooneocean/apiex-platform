---
name: verify
description: "獨立驗證 — 探索 codebase、查詢資料庫、核對文件，純讀取不修改。觸發：「驗證」「確認一下」「verify」"
tags: [adapter-wrapper]
---

# verify

> Adapter skill — 單一真相來源在 `.claude/commands/verify.md`

讀取並執行 `.claude/commands/verify.md`。

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
