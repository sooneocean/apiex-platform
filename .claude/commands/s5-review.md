---
description: "S5 Code Review - 驗證實作是否符合 Spec。僅在 S0~S7 SOP 管線內使用，不用於獨立 review。觸發：S4 完成後自動進入"
allowed-tools: Read, Grep, Glob, Bash, Task, Write, mcp__sequential-thinking__sequentialthinking
argument-hint: "<SDD-Context-JSON>"
---

# S5 Code Review（對抗式審查 + 品質審視）

> 對抗式審查協議見 `.claude/references/review-protocol.md`
> Session 目錄決策規則見 `review-protocol.md §Session 目錄決策規則`
> Code Review 細節見 `.claude/commands/code-review.md`
> S5 自動觸發 `/code-review s5`（Scoped Diff）

**Session 目錄**：從 `sdd_context.spec_folder` → `{spec_folder}/review/`。審查中介檔案（input_context.md、r1_findings.md 等）寫入此目錄。

## 環境資訊
- 當前分支: !`git branch --show-current`
- 變更檔案: !`git diff --name-only HEAD~1 2>/dev/null || git diff --name-only --cached 2>/dev/null || echo "(no changes detected)"`

## 輸入
S0~S4 輸出：$ARGUMENTS

---

## 審查範圍

| 條件 | 範圍 |
|------|------|
| sdd_context 有 s4.output.changes | **Scoped**（僅本次 SOP 檔案） |
| 無 sdd_context 或無 changes | **Full**（整個 git diff） |

> S4↔S5 迴路返回時，必須重新讀取 changes 並重新組裝 input_context.md。

---

## S5 Additional Checklist（注入 R1）

> 依 CLAUDE.md `{{REPO_RULES}}` 和 `{{CODING_STYLE}}` 中定義的規範注入。

---

## 審查核心（對照 Spec）

| 來源 | 驗證 | 方式 |
|------|------|------|
| S0 成功標準 | 是否達成 | 功能測試 |
| S1 影響範圍 | 是否只改該改的 | 比對變更清單 |
| S1 任務 DoD | 是否滿足 | 代碼檢查 |
| API Spec（若存在） | API 實作是否符合契約 | 對照 s1_api_spec.md |

> 此驗證由 S5 Skill 自身執行（非 R1 職責），在 R1→R2→R3 完成後、報告產出前進行。詳見下方「Spec 對照驗證步驟」。

---

## Spec 對照驗證步驟

> R1→R2→R3 完成後、報告產出前執行。由 S5 Skill 自身執行，非 R1 職責。

### 驗證流程

1. **讀取基準**：從 sdd_context.json 提取：
   - `stages.s0.output.success_criteria`（成功標準陣列）
   - `stages.s1.output.impact_scope`（預期影響範圍）
   - `stages.s1.output.tasks`（任務清單含 DoD）
   - `stages.s1.output.api_spec_path`（API 契約，若存在）

2. **S0 成功標準驗證**：逐條確認 code 是否兌現
   - 功能性標準 → Grep/Read 在 s4.output.changes 檔案中搜尋實作證據
   - 測試性標準 → 讀取 `s4.output.build_status` 取證
   - 找到具體實作 → ✅
   - 部分實作或需推論 → ⚠️
   - 找不到對應實作 → ❌（ID: SC-S0-{n}，歸為 P1 blocking）

3. **S1 影響範圍驗證**：
   - 逐層比對預期檔案數 vs 實際變更檔案數
   - 多改（scope creep）→ ⚠️ 記錄（ID: SC-SCOPE-{layer}）
   - 少改（可能遺漏）→ ⚠️ 需確認

4. **S1 任務 DoD 驗證**：逐任務 → 逐 DoD 項，確認代碼/測試涵蓋
   - 全部 DoD 通過 → ✅
   - 缺少 DoD 項 → ❌（ID: SC-DOD-{taskId}-{dodIndex}）或 ⚠️

5. **API 契約一致性驗證**（若 `api_spec_path` 存在）：
   - 讀取 `{spec_folder}/s1_api_spec.md`
   - 驗證 Controller route 是否與 Spec endpoint 一致
   - 驗證 Request/Response DTO 欄位是否與 Spec 定義一致
   - 驗證 Error Codes 是否與 Spec 定義一致
   - 不一致 → ❌（ID: SC-API-{n}，歸為 P1 blocking）

### 結果處理

- ❌ 項目追加至 5a 已組裝的 `blocking_fixes`，更新 `issues.p1_blocking` 計數
- ⚠️ 項目記錄於 `spec_verification.issues` 但不阻斷
- **conclusion 重算**：若新增任何 SC-P1-xxx blocking：
  - pass / conditional_pass → 升級為 `fix_required`
  - fix_required / redesign_required → 維持（不降級）
- 結果填入報告模板「Spec 對照驗證」三表 + sdd_context `spec_verification` 欄位

---

## 智慧回饋

- ✅ 通過（含 Short-Circuit）→ 等待確認進入 S6
- ⚠️ P1 → 自動回 S4 修復 + Pitfall 追加
- 🔴 P0 → 自動回 S1 重新分析

迴路安全閥：S4↔S5 最多 3 次。

---

## 報告產出

> R1~R3 完成後、SDD Context 更新前執行。

**Full Spec 模式**：
1. 讀取模板 `dev/specs/_templates/s5_code_review_report_template.md`
2. 填入審查結果（審查摘要、檔案清單、blocking/recommended/dismissed 三表、問題統計、程式碼修正、Spec 對照驗證、審查軌跡）
3. 寫入 `{spec_folder}/s5_code_review_report.md`

**Quick 模式**：跳過（審查結果僅存 sdd_context.json）

### repair_entry → repair_history 轉換

Skill 從 reviewer 的 `repair_entry`（trigger_issues, previous_loop, observation）+ S4 修復結果 + R3 verdict 組裝：
- `loop` = previous_loop + 1
- `trigger_issues` ← reviewer.repair_entry.trigger_issues
- `fixes_applied` ← S4 修復結果（Skill 從 S4 變更記錄取得）
- `result` ← R3 verdict（fix_required / pass）
- `timestamp` ← Skill 生成 ISO8601

---

## SDD Context 持久化

> 操作手冊見 `.claude/references/sdd-context-persistence.md`（S5 區段）

S5 更新欄位：
- **報告**：`review_report_path`（Full Spec 才有）
- **範圍**：`review_scope`, `scoped_files`
- **結論**：`conclusion`（pass/conditional_pass/fix_required/redesign_required）, `score`
- **對抗式 metadata**：`adversarial_review`（巢狀結構）
- **問題**：`issues`（計數）, `blocking_fixes`, `recommended_fixes`, `dismissed`（詳情）
- **修正**：`fixes_applied`
- **Spec 驗證**：`spec_verification`（S0 通過率、S1 範圍一致性、DoD 通過率、未達項清單）
- **迴圈**：`next_action`, `repair_loop_count`, `repair_history`

通過時 `status` → `pending_confirmation`，`current_stage` **維持 S5**（🟡 確認 Gate，等用戶確認後由 S6 推進）
P1 → `current_stage` 回 S4 / P0 → `current_stage` 回 S1

---

## S5 Gate

> Gate 行為依 `sdd_context.execution_mode` 決定。

### Autopilot 模式

🟢 **自動推進。** Code Review 通過後直接進入 S6 測試。

### Semi-Auto / Manual 模式

🟡 **確認！Code Review 通過，等待用戶確認後進入 S6 測試。**

- ✅ 輸入「繼續」進入 S6 測試
- ✏️ 說明需要額外修改的部分

**S6 會執行：**
1. 後端測試驗證
2. 前端測試驗證
3. E2E API 測試（需 server running）
4. 產出手動測試清單（涉及 UI 互動 / 狀態機時）
5. 驗收標準驗證（逐條核對 S1 的 Given-When-Then 場景）
6. 缺陷閉環修復（失敗 → 診斷 → 修復 → 重測，最多 3 次）
