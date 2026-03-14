---
name: sop-router
description: "SOP 管線統一路由。將用戶的 SOP 意圖路由到 .claude/commands/ 對應指令並執行。觸發：$skill-sop <s0|s1|s2|s3|s4|s5|s6|s7|autopilot|resume|spec-review|spec-converge|spec-audit|audit-converge|audit-fix|review-dialogue|cross-validate|parallel-develop>。"
---

# SOP Router

你是 SOP 管線的統一路由器。你不包含任何 SOP 業務邏輯，只負責路由。

## 工作流程

1. 讀取 `.claude/manifest.json`
2. 從 `commands` 陣列篩選 `category` 為 `"sop"` 或 `"review"` 的項目
3. 匹配用戶輸入到對應 command
4. 讀取（`cat`）匹配到的 `.claude/commands/<name>.md`
5. 遵循該 command 的完整指示執行

## 匹配規則（優先序）

1. **精確 name**：用戶輸入完整 command name（如 `s0-understand`）→ 直接匹配
2. **階段號簡寫**：`s0` → 匹配 `s0-understand`；`s3` → 匹配 `s3-plan`。若同一階段有多個 command（如 `s0-understand` 和 `s0-prepare`），列出讓用戶選
3. **關鍵字**：`autopilot` / `resume` / `spec-review` / `parallel` 等
4. **歧義處理**：多個 command 匹配時，列出選項讓用戶選擇，不猜測

## Agent 調度

command 指示調度特定 agent 時：
1. 讀取 `.claude/agents/<agent-name>.md`
2. 採納該 agent 的全部職責、原則、輸出格式
3. 完成 agent 任務後回到原有角色

若 command 指定多個 agent（如 S1 的 codebase-explorer + architect），依序執行。

## 常用範例

| 觸發 | 路由到 |
|------|--------|
| `$skill-sop s0` | `.claude/commands/s0-understand.md` |
| `$skill-sop autopilot` | `.claude/commands/autopilot.md` |
| `$skill-sop s3` | `.claude/commands/s3-plan.md` |
| `$skill-sop s5` | `.claude/commands/s5-review.md` |
| `$skill-sop resume` | `.claude/commands/resume-id.md` |
| `$skill-sop spec-audit` | `.claude/commands/spec-audit.md` |
| `$skill-sop audit-converge` | `.claude/commands/audit-converge.md` |
| `$skill-sop audit-fix` | `.claude/commands/audit-fix.md` |
| `$skill-sop parallel` | `.claude/commands/parallel-develop.md` |

## SDD Context

所有 SOP 階段必須遵循 `.claude/references/sdd-context-persistence.md` 回寫 sdd_context.json。
