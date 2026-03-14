---
name: audit-converge
description: "Audit 收斂迴圈 — 自動循環 spec-audit → fix 直到 P0=P1=P2=0 或達 10 輪上限。觸發：「audit 收斂」「audit converge」「一直審計到沒問題」「自動修到好」「audit loop」"
tags: [adapter-wrapper]
---

# audit-converge

> Adapter skill — 單一真相來源在 `.claude/commands/audit-converge.md`

讀取並執行 `.claude/commands/audit-converge.md`。

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
