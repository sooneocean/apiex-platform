---
description: "Code Review（獨立使用）- 審查程式碼變更，不需要在 SOP 流程中。觸發：「審查 code」、「review code」、「幫我看一下程式碼」"
allowed-tools: Read, Bash, Grep, Glob, Task, mcp__sequential-thinking__sequentialthinking
argument-hint: "[opus] <spec 目錄路徑 | git diff 範圍 | latest | s5>"
---

# Code Review（對抗式雙 AI 審查）

> 對抗式審查協議（引擎選擇、R1/R2/R3 流程、Session 隔離、Fallback）見 `.claude/references/review-protocol.md`

## 環境資訊
- 當前分支: !`git branch --show-current`
- 變更檔案: !`git diff --name-only HEAD~1 2>/dev/null || git diff --name-only --cached 2>/dev/null || echo "(no changes detected)"`

## 輸入
審查目標：$ARGUMENTS

---

## Code Review 設定

| 項目 | 設定 |
|------|-----|
| R2 防禦 Agent | `reviewer` |
| Codex Skill | `code-review-challenge` |
| Standards 路徑 | `~/.codex/skills/code-review-challenge/references/` |
| 審查目標 | git diff + changed source files |

---

## 任務流程

### 1. 解析參數

- `latest` / 無參數 → Codex 引擎，最新變更
- `opus latest` → Opus 引擎
- `HEAD~3..HEAD` → 指定 diff 範圍
- `s5` → Scoped Diff（從 sdd_context.stages.s4.output.changes 取檔案清單）
- `dev/specs/.../` → 指定 spec 目錄

### 2. 確認審查範圍

**s5 模式**（Scoped Diff）：只審查當前 SOP 動到的檔案
- 從 sdd_context changes（added + modified）取得檔案清單
- `git diff main -- $FILES`（modified）+ 讀取完整內容（added）

**標準模式**：`ls -td dev/specs/*/ | head -1` + `git diff HEAD~1`

### 3. Context Assembly

寫入 `$SESSION_DIR/input_context.md`：Review Standards + Output Format + Spec（Task+DoD+成功標準）+ Changed Files + Diff + Source Files

大小控制：Diff >200KB → ±50 行 context，總計 ≤300KB

### 4. R1→R2→R3 執行（Orchestrator 並行調度）

> 詳細流程見 `review-protocol.md`。Short-Circuit：無 P0/P1 時跳過 R2+R3。

#### R1 挑戰（codex-liaison Agent）

```
Task(
  subagent_type: "codex-liaison",
  model: "sonnet",
  prompt: "執行 Code Review R1 挑戰：\n\n
場景：code-review\n
scope: code\n
sandbox_mode: workspace-write\n
codex_skill: code-review-challenge\n
session_dir: $SESSION_DIR\n
input_context_path: $SESSION_DIR/input_context.md\n
output_path: $SESSION_DIR/r1_findings.md\n\n
讀取 input_context.md，使用 Codex exec 呼叫 code-review-challenge skill 進行 R1 挑戰。\n
完成後回傳結構化 JSON（type=codex-review, scope=code）。",
  description: "Code Review R1 挑戰"
)
```

> **Short-Circuit**：R1 結果 P0=P1=0 → 跳過 R2+R3，直接通過。

#### R2 防禦（reviewer Agent）

- `Task(subagent_type: "reviewer")` — 接收 R1 findings，對照 Spec 逐條防禦/接受

#### R3 裁決

- `Task(subagent_type: "general-purpose", model: "sonnet")` — 最終裁決

### 5. 整合最終報告

**5a. 組裝 SDD Context output**：
- 從 R1 findings 提取嚴重度分類 → 組裝 `issues` 計數物件（p0, p1_blocking, p1_recommended, p2, dismissed）
- 從 R2 defense + R3 verdict 組裝詳情陣列：`blocking_fixes`（阻斷）、`recommended_fixes`（建議）、`dismissed`（駁回）
- 每個 issue 含：id, description, r2_response, r3_verdict, fix（如有）, file/line（如有）
- 組裝 `fixes_applied`（本輪修正描述清單）
- 若有迴圈：從 reviewer 的 `repair_entry`（trigger_issues, observation）+ S4 修復結果 + R3 verdict → 組裝 `repair_history` 條目

**5b. Spec 對照驗證**（僅 `s5` 模式）：
- 條件：參數為 `s5`（獨立 review 無 S0/S1 context，跳過）
- 從 sdd_context 讀取三組驗證基準：
  1. `s0.output.success_criteria` → 逐條確認 code 是否兌現
     - 功能性標準 → Grep/Read 搜尋實作代碼
     - 測試性標準（如「13+ TC 全通過」）→ 讀取 `s4.output.build_status`
  2. `s1.output.impact_scope` vs `s4.output.changes` → 對比檔案清單一致性
  3. `s1.output.tasks[].dod` → 逐任務逐項確認 DoD 是否滿足
- 每項標記：✅ 通過 / ⚠️ 部分 / ❌ 未達成
- SC- 項目追加至 5a 已組裝的 output：
  1. ❌ 項目追加至 `blocking_fixes`（ID 格式：SC-S0-{n} / SC-SCOPE-{layer} / SC-DOD-{taskId}-{dodIndex}）
  2. 更新 `issues` 計數（p1_blocking +N）
  3. 新增 `spec_verification` 欄位
- **conclusion 重算**：若 Spec Check 產生任何 SC-P1-xxx blocking 項目：
  - R3 conclusion 為 pass → 升級為 fix_required
  - R3 conclusion 為 conditional_pass → 升級為 fix_required
  - R3 conclusion 為 fix_required → 維持
  - R3 conclusion 為 redesign_required → 維持（更嚴格，不降級）

**5c. 產出 .md 報告**（僅 `s5` 模式 + Full Spec）：
- 條件：參數為 `s5` 且 `sdd_context.spec_mode == "full"`
- 讀取模板 `dev/specs/_templates/s5_code_review_report_template.md`
- 填入 5a + 5b 組裝的結果（含 Spec 驗證結果）→ 寫入 `{spec_folder}/s5_code_review_report.md`
- 非 s5 參數（`latest`、`HEAD~N`、`opus` 等獨立 review）→ 不產出 .md

**5d. 更新 SDD Context**（僅 `s5` 模式）：
- 條件：參數為 `s5`
- 讀取 sdd_context.json → 更新 `stages.s5.output`（全欄位，見 `sdd-context-schema.md` v2.3.1 S5 定義，含 `spec_verification` 摘要）
- 寫回 sdd_context.json
- 非 s5 參數 → 不寫 sdd_context

---

## 使用範例

```
/code-review latest                 # Codex，最新變更
/code-review opus latest            # Opus 引擎
/code-review HEAD~3..HEAD           # 指定 diff 範圍
/code-review s5                     # Scoped Diff（SOP 管線用）
/code-review dev/specs/2026-.../    # 指定 spec 目錄
```
