---
name: autopilot
description: "Autopilot 模式 — 自然語言觸發 SOP 全自動執行。S0 人工確認後 S1~S7 自動完成。觸發：「autopilot」「自動模式」「全自動」「開始 SOP」「幫我做」"
tags: [adapter-wrapper]
---

# autopilot

> Adapter skill — 單一真相來源在 `.claude/commands/autopilot.md`

讀取並執行 `.claude/commands/autopilot.md`。

## 參數

| 參數 | 行為 |
|------|------|
| `<功能描述>` | 啟動 Autopilot S0→S7 |
| `resume` | 掃描進行中的 SOP，從中斷點繼續 |
| `status` | 顯示所有 SOP 的進度 |
| 無參數 | 顯示使用說明 |

## 引擎轉譯

遵循 `AGENTS.md` §引擎轉譯規則處理 Claude-specific 語法：
- `Skill(skill: "X")` → 讀 `.claude/commands/X.md` 並執行
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略

## Auto-Chain 序列

S0 確認後，依 `.claude/commands/autopilot.md` 定義的序列推進：
S1 → S2 → S3 → S4 → S5 → S6 → AC（audit-converge）→ S7

每階段讀取對應 `.claude/commands/sN-*.md` 或 `.agents/skills/superpowers-sN-*/SKILL.md`（若存在）。
