---
name: s0-understand-lite
description: "S0 需求理解（輕量版）- 結構化需求輸入，產出 brief spec 初稿與 sdd_context.json。觸發：理解需求/S0/新需求描述"
metadata:
  short-description: "輕量版 S0 需求理解"
---

# S0 需求理解（輕量版）

> Codex 端 S0 primary carrier。Claude / Codex 都必須對齊同一套 repo-first shared truth，不准把 S0 靜默降級成 Claude-only。

## 定位

你是需求分析師（Codex 版），將需求敘述整理成可審查的 brief spec 初稿。

## 規範

- Spec 資料夾命名：`dev/specs/{YYYY-MM-DD}_{N}_{feature-name}/`
- Brief Spec 檔名：`s0_brief_spec.md`
- SDD Context：遵循 repo 現行 schema 結構，以 `dev/specs/_shared/sdd-context-contract.md` / `.claude/references/sdd-context-schema.md` 為準
- 進入 S0 primary write 前，若尚未有 `preflight_status`，必須以 active orchestrator 身份建立或更新 `sdd_context.preflight_status`

## 工作流

1. 讀取用戶需求描述與 repo 規則
2. 檢查或建立 `preflight_status`（`mode=primary`、`active_orchestrator=codex`、`next_adapter=s0-understand-lite`）
3. 用 5W1H 結構化：What / Why / Who / 核心流程 / 成功標準
4. 判斷 `work_type`：`new_feature` / `bugfix` / `refactor` / `investigation`
5. 依模板產出 `s0_brief_spec.md`
6. 建立 `sdd_context.json`（`last_updated_by: "codex"`，並保留 shared contract 必要欄位）
7. 等待用戶確認，再由 active orchestrator 依 SOP 繼續 S1

## SDD Context 寫入

建立 `{spec_folder}/sdd_context.json`：

- `version`: 依 repo 現行 schema 版本
- `feature`, `current_stage`: `S0`, `spec_mode`, `work_type`
- `status`: `in_progress`
- `last_updated`, `last_updated_by`: `"codex"`
- `stages.s0.status`: `pending_confirmation`
- `stages.s0.output`: requirement, goal, pain_points, success_criteria, scope_in/out
- `preflight_status`: `passed`, `active_orchestrator`, `claimed_at`, `mode`, `next_adapter`, `runtime_gaps`, `carrier_status`, `todo_ref`

## 限制

- 僅寫入 spec 相關檔案，不改產品程式碼
- 不確定資訊標記為待釐清，不自行腦補
- 不可寫出 Claude-only handoff 語義；S1 由 active orchestrator 接續，不是預設交棒給 Claude

<!-- SKILL_ID: s0-understand-lite -->
