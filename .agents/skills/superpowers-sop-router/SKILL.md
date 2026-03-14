---
name: superpowers-sop-router
description: "SOP x Superpowers 路由器。當任務要在 S0~S7 借用 superpowers 能力時使用，避免覆蓋既有 SOP、sdd_context 與 review 協議。"
metadata:
  short-description: "SOP 與 Superpowers 轉接層"
---

# SOP x Superpowers Router

## 目標

把 superpowers 當能力庫，不是主流程 orchestrator。
主流程永遠是 SOP 的 S0~S7 + `sdd_context.json`。

## 優先序

1. Repo `AGENTS.md` / `CLAUDE.md` / `.claude/references/*` 規則優先
2. 本轉接 Skill
3. Superpowers 原生預設

## 強制規則

- 不可把輸出寫到 `docs/plans/*`。S3 計畫只能寫 `dev/specs/.../s3_implementation_plan.md`。
- 不可讓 superpowers 接管你現有對抗式審查（`review-sync` + R1/R2/R3）。
- 不可改動 SDD 命名規則（`s0_brief_spec.md`、`s1_dev_spec.md`、`s3_implementation_plan.md`）。
- `using-superpowers` 不作為全域 bootstrap 強制流程；只在你明確需要時參考其規範。
- Primary Development 寫入前，必須先讀 `sdd_context.json`、對應 stage artifact、`preflight_status`

## 階段映射

- S0：可參考 `brainstorming` 的提問節奏；需求定稿與檔案輸出仍走既有 S0 Skill
- S1：維持既有流程（不替換）
- S2：維持既有 `s2-spec-review-r1` / `review-sync`（不替換）
- S3：可借 `writing-plans` 方法，但輸出必須符合 SOP S3 模板
- S4：可借 `test-driven-development` + `verification-before-completion`
- S5：維持既有 Code Review 協議；可借 `receiving-code-review` 的回應紀律
- S6：可借 `systematic-debugging` + `verification-before-completion`
- S7：可借 `finishing-a-development-branch` 的收尾檢查

## Preflight

進入 repo 後，先做這四件事：

1. 讀 `sdd_context.current_stage`、`spec_folder`、`preflight_status.mode`
2. 檢查對應 stage artifact 是否存在
3. 檢查 `preflight_status` 是否允許本次寫入；若缺失或 `passed != true`，先更新/建立 artifact，再談實作
4. 若存在 `runtime_gaps`，必須明講；可以帶著 gap 進行 primary write，但不可假裝 runtime 已完整

## Resume Routing

| 條件 | 對應 carrier | 行為 |
|------|-------------|------|
| `current_stage=S0` 且 `mode=primary` | `.agents/skills/s0-understand-lite/SKILL.md` | 建立 brief spec + `sdd_context.json` |
| `current_stage=S3` 且 `mode=primary` | `.agents/skills/superpowers-s3-plan/SKILL.md` | 產出 `s3_implementation_plan.md` + `stages.s3.output` |
| `current_stage=S4` 且 `mode=primary` | `.agents/skills/superpowers-s4-implement/SKILL.md` | 依波次執行任務並回寫 `stages.s4.output` |
| `current_stage=S6` 且 `mode=primary` | `.agents/skills/superpowers-s6-test/SKILL.md` | 撰寫/執行測試與修復閉環 |
| `current_stage=S7` 且 `mode=primary` | `.agents/skills/superpowers-s7-commit/SKILL.md` | 收尾、提交、lessons learned |
| `mode=review` | `review-sync` / `review-challenge` | 只允許寫 `review/*` artifacts，不得改 source/stage |

Resume routing 依據是 `current_stage + mode + spec_folder`，不是聊天上下文。

## Stage Gate

- 宣稱某 stage ready / completed 前，必須驗證命名規則、必要 artifact、寫入邊界、review boundary
- 若 gate fail，只能停留在分析或規格修正，不得開始越過 gate 的實作

## 啟動建議

進入各階段時，先用對應 adapter：

- S3：`superpowers-s3-plan`
- S4：`superpowers-s4-implement`
- S6：`superpowers-s6-test`
- S7：`superpowers-s7-commit`
