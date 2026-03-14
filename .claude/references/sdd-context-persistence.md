# SDD Context 持久化操作手冊

> Schema 定義見 `sdd-context-schema.md`

## 通用三步驟

1. **讀取** sdd_context.json（路徑：`{spec_folder}/sdd_context.json`，Quick 與 Full Spec 統一）
2. **更新**當前階段欄位 + `last_updated`
3. **寫回**檔案

## Agent Self-Write Protocol

> **目的**：消除 Agent 完成工作與 Skill 寫入 sdd_context.json 之間的壓縮風險窗口。

### 核心原則

1. **Agent 自寫**：每個 Agent 在回傳結果前，**必須（MUST）** 自己讀取→更新→寫回 sdd_context.json
2. **Skill 傳路徑**：Skill dispatch Agent 時，在 prompt 中傳入 `sdd_context_path: {path}`
3. **Merge not Overwrite**：Agent 讀取現有 JSON，只更新自己階段的欄位，保留其他階段
4. **向後相容**：若 prompt 中無 sdd_context_path，跳過持久化（不報錯）
5. **last_updated_by**：每次寫入 sdd_context.json 時，同步更新 `last_updated_by` 欄位（值為 `"claude"` 或 `"codex"`，人工修改時為 `"human"`）

### 職責劃分

| 層級 | 負責內容 | 範例 |
|------|---------|------|
| Agent | 寫入本階段 output + 更新 stage status | codebase-explorer 寫 s1.output.impact_scope |
| Skill | 跨階段 current_stage 推進 + 跨 stage 狀態轉換 | S1 完成後 Skill 驗證 current_stage = S2 |

> 部分 Agent（如 architect S1P2、git-operator S7）同時負責 current_stage 推進，見各階段規格。

### S4 並行任務特例

S4 同波次無依賴任務可並行調度。為避免 race condition：
- **串行任務**：Skill 傳 `sdd_context_path` + `task_id`，Agent 完成後追加 completed_tasks
- **並行任務**：Skill **不傳** sdd_context_path，所有 Agent 回傳後由 Skill 統一寫入
- Skill 判斷依據：S3 implementation plan 中的 `parallel` 標記

### Agent 自寫步驟模板

```
1. 檢查 prompt 是否包含 sdd_context_path
2. 若無 → 跳過持久化，正常回傳結果
3. 若有 → 讀取 sdd_context.json
4. 更新自己階段的欄位（見各 Agent 持久化規格）
5. 更新 last_updated → ISO8601
6. 寫回 sdd_context.json
7. 回傳結果
```

## 各階段更新規格

| 階段 | 操作 | 更新欄位 | current_stage 推進 | 負責完成前一階段 |
|------|------|---------|-------------------|-----------------|
| S0 | **建立**（唯一建立者） | version, feature, spec_mode, work_type, status, started_at, s0.output | 維持 S0（必停） | — |
| S1 | 更新 | s1.status→completed, s1.output(impact_scope, tasks, acceptance_criteria...) | → S2 | s0.status→completed |
| S2 | 更新 | s2.status, s2.output(conclusion, r1_engine, findings_summary, fixes_applied...) | → S3 | — |
| S3 | 更新 | s3.status→pending_confirmation, s3.output(waves, total_tasks...) | 維持 S3（必停） | — |
| S4 | 漸進更新 | s4.output.completed_tasks（每任務追加）, progress, changes | → S5 | s3.status→completed |
| S5 | 更新 | s5.status, s5.output(conclusion, score, issues...) | 通過→維持 S5（🟡 確認）/ P1→S4 / P0→S1 | — |
| S6 | 更新 | s6.output(automated_tests, defects, repair_loop_count, recommendation) | 通過→維持 S6（🟡 確認）/ 回 S4 | s5.status→completed |
| S7 | **完成 + 清理** | s7.output(commit_hash, branch, stats), status→completed | Quick：刪除 active.json | s6.status→completed |

## S0 建立（唯一建立者）

建立路徑：
- Quick 與 Full Spec 統一 → `{spec_folder}/sdd_context.json`

建立步驟：
1. 建立 spec_folder（如不存在）：`dev/specs/{YYYY-MM-DD}_{N}_{feature-name}/`（N 為當日序號，從 1 起算）。**Quick 模式也建立 spec_folder**。
2. Full Spec 模式：依模板 `dev/specs/_templates/s0_brief_spec_template.md` 產出 `{spec_folder}/s0_brief_spec.md`
3. 組裝 SDD Context JSON（version: "2.2.1"、feature、spec_mode、spec_folder、s0.output 含 brief_spec_path 等）
4. 使用 Write tool 寫入對應路徑
5. 確認成功後再輸出 Gate prompt

初始化內容：
- 頂層：`work_type`（S0 判斷的工作類型）
- `stages.s0.status`: "pending_confirmation"、`agent`: "requirement-analyst"
- `stages.s0.output`: brief_spec_path, work_type, requirement, goal, success_criteria, pain_points, scope_in/out, constraints
- 其餘 s1~s7: `status: "pending"`

## S1 更新（兩階段）

S1 分兩階段執行，持久化責任如下：

### Phase 1：codebase-explorer（探索）

由 `codebase-explorer` 完成後更新：
1. **讀取**現有 sdd_context.json
2. **更新** `stages.s0.status` → `"completed"`（S1 負責完成 S0，同 S4 完成 S3、S6 完成 S5、S7 完成 S6 的模式）
3. **更新** `stages.s1`：`status` → `in_progress`、`agents` → `["codebase-explorer"]`
4. **推進** `current_stage` → `S1`
5. **填入** `output` 的探索結果：`completed_phases: [1]`, `impact_scope`, `risks`, `unknowns`, `dependencies`, `regression_risks`
6. **更新** `last_updated`
7. **寫回**檔案

### Phase 2：architect（規格撰寫）

由 `architect` 完成後更新：
1. **讀取**現有 sdd_context.json
2. **更新** `stages.s1`：`status` → `completed`、`agents` → `["codebase-explorer", "architect"]`、填入 `completed_at`
3. **補充** `output` 的設計結果：`completed_phases: [1, 2]`, `dev_spec_path`, `tasks`, `acceptance_criteria`, `assumptions`, `solution_summary`, `tech_debt`
4. **（可選）若 work_type 為 investigation 且已轉型**：填入 `output.work_type_revised` 並同步更新頂層 `work_type_revised`
5. **推進** `current_stage` → `S2`
6. **更新** `last_updated`
7. **寫回**檔案

S1 output 完整欄位：dev_spec_path, impact_scope, tasks, acceptance_criteria, risks, unknowns, assumptions, solution_summary, dependencies, tech_debt, regression_risks, work_type_revised（可選）

## S2 更新

### Full Spec 模式

**報告產出**（R1~R3 完成後，SDD Context 更新前）：
1. 依模板 `dev/specs/_templates/s2_review_report_template.md` 產出 `{spec_folder}/s2_review_report.md`
2. 填入：審查摘要、問題清單與處置（含 R2 回應 + R3 裁決）、完整性評分、審查軌跡
3. 若有修正 `s1_dev_spec.md`，記錄修正前後差異到「修正摘要」區段

**SDD Context 更新**：
- `stages.s2.status`: "completed" | "fix_required"
- `stages.s2.agents`: ["architect"]
- `stages.s2.started_at` / `completed_at`: ISO8601
- `stages.s2.output`: review_report_path, conclusion, r1_engine, short_circuit, findings_summary（p0/p1/p2_maintained + dismissed）, fixes_applied（陣列）, key_design_change
- `current_stage` → "S3"（通過）/ 維持 "S2"（需修正）

### Quick 模式（跳過 S2）
- `stages.s2.status`: "skipped"
- `stages.s2.output`: `{ "reason": "Quick 模式跳過 S2" }`
- `current_stage` → "S3"

## S3 更新

1. **讀取**現有 sdd_context.json
2. **更新** `stages.s3`：`status` → `pending_confirmation`、填入 `completed_at` 和 `output`（含波次、任務清單、Agent 分配）
3. **維持** `current_stage` → `S3`（S3→S4 是必停 Gate，等用戶確認後才推進）
4. **更新** `last_updated`
5. **寫回**檔案

> 用戶確認後進入 S4 時，由 S4 Skill 負責將 `current_stage` 推進到 `S4` 並更新 `stages.s3.status` → `completed`。

## S4 漸進更新（特殊：三個更新時機）

### S4 開始時
1. **讀取**現有 sdd_context.json
2. **更新** `current_stage` → `S4`、`stages.s3.status` → `completed`
3. **更新** `stages.s4`：`status` → `in_progress`、填入 `started_at`
4. **寫回**檔案

### 每完成一個任務時
1. **讀取** sdd_context.json
2. **更新** `stages.s4.output.completed_tasks`（追加已完成任務 ID）
3. **更新** `stages.s4.output.progress`（更新完成率）
4. **更新** `stages.s4.output.changes`（追加新增/修改的檔案）
5. **更新** `last_updated`
6. **寫回**檔案

### S4 全部完成時
1. **讀取** sdd_context.json
2. **更新** `stages.s4`：`status` → `completed`、填入 `completed_at`、`output.build_status`
3. **推進** `current_stage` → `S5`
4. **更新** `last_updated`
5. **寫回**檔案

## S5 更新

### 報告產出（R1~R3 完成後，SDD Context 更新前）

**Full Spec 模式**：
1. 依模板 `dev/specs/_templates/s5_code_review_report_template.md` 產出 `{spec_folder}/s5_code_review_report.md`
2. 填入：審查摘要、審查檔案清單、問題清單與處置（blocking/recommended/dismissed 三表，含 R2 回應 + R3 裁決）、問題統計、程式碼修正摘要、Spec 對照驗證、審查軌跡（引擎+摘要，不記錄 /tmp 路徑）
3. 若有 S4↔S5 迴圈，填入迴圈修復歷史

**Quick 模式**：不產出 .md，審查結果僅存 sdd_context.json

### SDD Context 更新

- `stages.s5.status`: "pending_confirmation"（通過/有條件通過）| "fix_required"（P1）| "redesign_required"（P0）
- `stages.s5.agent`: "reviewer"
- `stages.s5.started_at` / `completed_at`: ISO8601
- `stages.s5.output`:
  - **報告**：`review_report_path`（Full Spec 才有，指向 s5_code_review_report.md）
  - **範圍**：`review_scope`（scoped/full）、`scoped_files`（檔案清單）
  - **結論**：`conclusion`（pass/conditional_pass/fix_required/redesign_required）、`score`（string，如 "3.5/5"）
  - **對抗式 metadata**：`adversarial_review`（巢狀：engine, r1_model, r3_model, cross_vendor, session, pre_fed, short_circuit）
  - **問題統計**：`issues`（計數物件：p0, p1_blocking, p1_recommended, p2, dismissed）
  - **問題詳情**：`blocking_fixes`（阻斷清單，含 id/description/file/line/fix/r2_response/r3_verdict）、`recommended_fixes`（建議清單）、`dismissed`（駁回清單）
  - **修正追蹤**：`fixes_applied`（修正描述陣列）
  - **Spec 驗證**：`spec_verification`（S0 成功標準通過率、S1 影響範圍一致性含 expected/actual/match、DoD 通過率、未達項清單）
  - **動作與迴圈**：`next_action`（action + reason）、`repair_loop_count`、`repair_history`（迴圈歷史陣列）
- `current_stage`：通過→維持 "S5"（🟡 確認 Gate，等用戶確認後由 S6 推進）/ P1→"S4" / P0→"S1"

> 用戶確認後進入 S6 時，由 S6 Skill 負責將 `current_stage` 推進到 `S6` 並更新 `stages.s5.status` → `completed`。

### S4↔S5 迴圈返回（P1 回 S4）

當 S5 結論為 fix_required（P1）時：
1. **記錄** `stages.s5.output.conclusion` → `"fix_required"`
2. **遞增** `stages.s5.output.repair_loop_count` → +1
3. **追加** `stages.s5.output.repair_history` 條目：
   - Skill 從 reviewer 的 `repair_entry`（trigger_issues, observation）+ S4 修復結果（fixes_applied）+ R3 verdict（result）組裝
   - 格式：`{ loop, trigger_issues, fixes_applied, result, timestamp }`
4. **重置** `stages.s5.status` → `"pending"`（等待下輪審查）
5. **重置** `stages.s4.status` → `"in_progress"`
6. **推進** `current_stage` → `"S4"`
7. **安全閥**：若 `repair_loop_count >= 3`，停下讓用戶裁決，不自動回 S4
8. **寫回**檔案

## S6 更新

### S6 開始時
1. **讀取**現有 sdd_context.json
2. **更新** `current_stage` → `S6`、`stages.s5.status` → `completed`
3. **更新** `stages.s6`：`status` → `in_progress`、填入 `started_at`
4. **寫回**檔案

### S6 完成時
1. **讀取**現有 sdd_context.json
2. **更新** `stages.s6`：填入 `completed_at` 和 `output`：
   - `automated_tests`（flutter_unit, dotnet_unit）
   - `e2e_tests`（curl API 測試結果）
   - `integration_tests`（Flutter integration test 觸發與結果，schema 見 `sdd-context-schema.md` S6 定義）
   - `defects`（缺陷統計）
   - `repair_loop_count`（修復迴圈次數）
   - `recommendation`（proceed_to_s7 | user_decision）
3. **根據測試結果決定狀態與推進**：
   - 全部通過 → `status` → `pending_confirmation`、`current_stage` 維持 `S6`（🟡 確認 Gate，等用戶確認後由 S7 推進）
   - 缺陷在 S6 內閉環修復後通過 → 同上
   - 缺陷需回 S4 → `status` → `fix_required`、`current_stage` → `S4`
4. **更新** `last_updated`
5. **寫回**檔案

> 用戶確認後進入 S7 時，由 S7 Skill 負責將 `current_stage` 推進到 `S7` 並更新 `stages.s6.status` → `completed`。

> **迴路安全閥規則**：
> - **誰遞增**：每次 S6 缺陷修復後重測時，由 test-engineer 遞增 `repair_loop_count`（S5 的 `repair_loop_count` 同理，由 reviewer 在 S4↔S5 迴圈時遞增）
> - **何時遞增**：在修復完成、**重測之前**遞增（確保計數包含當次嘗試）
> - **閾值判斷**：`repair_loop_count >= 3` 時停下讓用戶裁決（即最多嘗試 3 次修復）
>
> **計數範例**（以 S4↔S6 為例）：
> ```
> S6 測試 → 發現缺陷 → 修復 → count=1 → 重測 → 仍失敗
>                      → 修復 → count=2 → 重測 → 仍失敗
>                      → 修復 → count=3 → 停下（不再重測，讓用戶裁決）
> ```
> count 從 0 開始，每次修復完成後 +1，到 3 時停下。總計最多 3 次修復嘗試。

## S7 更新

### S7 開始時
1. **讀取**現有 sdd_context.json
2. **更新** `current_stage` → `S7`、`stages.s6.status` → `completed`
3. **更新** `stages.s7`：`status` → `in_progress`、填入 `started_at`
4. **寫回**檔案

### S7 完成 + 清理（特殊）

1. **讀取**現有 sdd_context.json
2. **更新** `stages.s7`：`status` → `completed`、填入 `completed_at` 和 `output`（commit_hash、branch、changes、stats）
3. **寫入** `lessons_learned`：what_went_well、what_went_wrong、new_pitfalls、captured_at
4. **更新頂層**：`status` → `completed`、`completed_at` → ISO8601
5. **更新** `current_stage` → `S7`（最終階段）
6. **更新** `last_updated` + `last_updated_by` → `"claude"`
7. **寫回**檔案

> **completed_at 寫入時機**：僅在 S7 完成時寫入頂層 `completed_at`（ISO8601）。此時 `status` 必須同步設為 `"completed"`（Invariant Rule 6）。

### Pitfalls 自動追加
寫回 sdd_context.json 後，將 `lessons_learned.new_pitfalls` 追加到 `dev/knowledge/pitfalls.md`：
1. 讀取 pitfalls.md
2. 根據 tag 找到對應分類區段
3. 在區段末尾追加新條目
4. 來源標記為 `{feature_name} ({YYYY-MM})`

### 清理作業

| Spec Mode | 清理動作 |
|-----------|---------|
| **Full Spec** | 保留 `{spec_folder}/sdd_context.json` 作為歷史紀錄，不刪除 |
| **Quick** | 保留 `{spec_folder}/sdd_context.json` 作為歷史紀錄，不刪除（與 Full Spec 統一） |

## 用戶取消（特殊）

當用戶說「取消」時：

1. **詢問取消原因**（簡短即可，如「需求變更」「方向不對」「太複雜」）
2. **讀取**現有 sdd_context.json
3. **更新** `status` → `cancelled`
4. **寫入** `lessons_learned`：
   - `what_went_wrong`: ["取消原因（從用戶輸入或當前 stage 推斷）"]
   - `new_pitfalls`: ["如有值得記錄的發現"]（無則留空陣列）
   - `captured_at`: ISO8601
5. 如有 `new_pitfalls`，追加到 `dev/knowledge/pitfalls.md`
6. **更新** `last_updated`
7. **寫回**檔案
8. Quick 模式：保留 `{spec_folder}/sdd_context.json`（與 Full Spec 統一，供回顧）
