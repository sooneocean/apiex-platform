---
description: "S6 測試階段 - 執行測試與缺陷閉環修復。僅在 SOP 管線內使用。觸發：S5 通過且用戶確認後進入、「測試」、「驗收」"
allowed-tools: Read, Grep, Glob, Bash, Task, TaskCreate, TaskUpdate, TaskList, mcp__sequential-thinking__sequentialthinking, mcp__genaiToolbox__execute_sql, mcp__genaiToolbox__show_table_structure, mcp__genaiToolbox__list_tables
argument-hint: "<SDD-Context-JSON>"
---

# S6 測試與驗收（修復閉環）

> 測試帳號、環境、curl 範例見 `.claude/references/e2e-test-guide.md`

## 環境資訊
- 當前分支: !`git branch --show-current`

## 輸入
S0~S5 輸出：$ARGUMENTS

---

## 核心原則

> **S6 必須閉環：發現問題 → 診斷 → 修復 → 重測 → 直到全數通過。**
> 閉環安全閥：S4↔S6 修復迴路最多 3 次，超過後停下讓用戶裁決。

---

## Agent 調度

**主要 Agent**：`test-engineer`

```
Task(
  subagent_type: "test-engineer",
  model: "sonnet",
  prompt: "根據以下驗收標準執行測試：\n\n驗收標準：{驗收標準}\n變更範圍：{S4 變更清單}\nSpec 目錄：{spec_folder}\nSpec 模式：{spec_mode}\n\nsdd_context_path: {sdd_context.json 完整路徑}\n\n測試帳號與環境見 .claude/references/e2e-test-guide.md\nIntegration Test 規範見 .claude/references/integration-test-guide.md\n\n請執行自動化測試與 E2E 驗證，產出測試報告。Full Spec 模式且涉及 UI/購買/狀態機時，依模板產出手動測試清單。資料流變更時依 integration-test-guide.md 撰寫並執行 integration test。",
  description: "S6 測試執行"
)
```

**缺陷修復**：`debugger` 診斷 + 對應實作 Agent 修復

```
Task(subagent_type: "debugger", model: "sonnet", prompt: "診斷測試失敗：{失敗描述}", description: "S6 缺陷診斷")
Task(subagent_type: "{flutter-expert|dotnet-expert}", model: "sonnet", prompt: "修復缺陷：{描述}\n修復方案：{debugger 建議}", description: "S6 缺陷修復")
```

---

## 任務流程

1. **手動測試清單**（Full Spec + UI/購買/狀態機時）：由 test-engineer 依模板 `dev/specs/_templates/s6_test_checklist_template.md` 產出
2. **自動化測試**：`cd app && fvm flutter test` + `cd server && dotnet test`
3. **E2E API 測試**：依 `e2e-test-guide.md` 流程執行認證 + 功能測試 + 資料驗證
4. **Integration Test**（觸發條件成立時）：
   - 觸發判斷：依 S4 變更清單比對資料流 pattern
   - 前置檢查：Server running + Simulator available
   - 依 TC-IT 案例撰寫 integration test → 執行 → 分類結果 → 回填清單
   - 操作指南見 `.claude/references/integration-test-guide.md`
> **驗證證據（MUST）**：每次測試執行須記錄：
> - `command`: 實際執行的命令
> - `exit_code`: 退出碼
> - `output_summary`: 輸出前/後 20 行
> - `timestamp`: 執行時間

5. **驗收標準驗證**：逐條驗證 S1 dev_spec 的 Given-When-Then
6. **缺陷閉環**：發現缺陷 → debugger 診斷 → 實作 Agent 修復 → 重測（最多 3 次）
   - 包含 integration test 發現的 `dev` 類型缺陷
7. **Pitfall 追加**：具普遍性的缺陷追加到 `dev/knowledge/pitfalls.md`

> **Note**：手動 UI 確認不是 agent 的步驟。S6 Gate 通過後，用戶自行目視模擬器確認 [manual] TC，結果由用戶回填。
>
> **手動測試引導**：手動 TC 的逐案互動測試流程使用 `/s6-manual-test` Skill。

---

## SDD Context 持久化

> 操作手冊見 `.claude/references/sdd-context-persistence.md`（S6 區段）

S6 開始時：更新 `current_stage` → `S6`、`stages.s5.status` → `completed`（S6 負責推進，同 S4 推進 S3 的模式）

S6 更新欄位：`stages.s6.status/agent/output`（含 automated_tests, e2e_tests, integration_tests, defects, repair_loop_count, recommendation）
推進：全部通過 → `current_stage` → S7；閉環修復 3 次仍失敗 → 停下由用戶裁決（可選：回 S4 深度修復 或 用戶手動介入）

---

## S6 Gate

- ✅ 全部通過 → **自動進入 Audit Converge**（`/audit-converge {spec_folder}`，最多 10 輪）
- ❌ 有缺陷 → 自動閉環修復（最多 3 次）
- 🔄 修復超過 3 次 → 停下讓用戶裁決

> **Autopilot Auto-Chain**：S6 全部通過後，自動調用 `/audit-converge` 進行 spec↔code 一致性收斂。
> 收斂完成（P0=P1=P2=0）→ 繼續 S7。未收斂 → 中斷通知用戶。

**S7 會執行：**
1. 整理變更檔案、分類（added / modified / deleted）
2. 生成 commit message（遵循 repo 慣例）
3. 執行 git commit
4. 生成 lessons_learned（what_went_well / what_went_wrong / new_pitfalls）
5. Pitfalls 追加（new_pitfalls → `dev/knowledge/pitfalls.md`）
6. 更新 sdd_context.json → status: completed
