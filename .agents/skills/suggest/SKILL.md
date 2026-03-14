---
name: suggest
description: "技能推薦員 — 分析意圖後推薦最佳 Skill 或組合技，產出可直接複製的執行 prompt，也可當場執行。觸發：怎麼查/怎麼做/推薦/suggest/該用什麼/哪個skill"
tags: [adapter-wrapper]
---

# suggest

> Adapter skill — 單一真相來源在 `.claude/commands/suggest.md`

讀取並執行 `.claude/commands/suggest.md`。

遵循 `AGENTS.md` 引擎轉譯規則處理 Claude-specific 語法：
- `Task(subagent_type: "X")` → 讀 `.claude/agents/X.md` 採納角色，在當前 session 執行
- `allowed-tools` → 忽略（Codex 無 tool 白名單）
- `!command` → 自行執行等效命令
- `$ARGUMENTS` → 替換為用戶原始輸入
- `model: "sonnet"` / `model: "opus"` → 忽略
