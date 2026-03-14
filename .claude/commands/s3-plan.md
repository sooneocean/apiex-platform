---
description: "S3 執行計畫 - 產出波次化實作計畫。僅在 SOP 管線內使用。觸發：S2 完成後自動進入"
allowed-tools: Read, Grep, Glob, Task, TaskCreate, TaskUpdate, TaskList, mcp__sequential-thinking__sequentialthinking
argument-hint: "<SDD-Context-JSON>"
---

# S3 執行計畫

## 環境資訊
- 當前分支: !`git branch --show-current`

## 輸入
S0~S2 輸出：$ARGUMENTS

---

## 核心原則

> **S3 = 把 dev_spec 轉化為可執行步驟。** 不重新設計，而是明確：做什麼（任務）、誰做（Agent）、先後（依賴+波次）、怎麼驗（DoD）。

---

## Spec Mode 分流

讀取 sdd_context.json 的 `spec_mode` 欄位：

| Spec Mode | 流程 | 說明 |
|-----------|------|------|
| **Quick** | Phase 1 only | architect 單獨規劃 |
| **Full Spec** | Phase 1 → Phase 2（驗證）→ Phase 3（處理）| 增加多維度交叉驗證 |

---

## Quick 模式

### Phase 1：architect 規劃

```
Task(
  subagent_type: "architect",
  model: "opus",
  prompt: "根據 brief_spec 和 dev_spec 產出執行計畫：\n\nBrief Spec：{S0}\nDev Spec：{S1}\nSpec Review：{S2}\n\nsdd_context_path: {sdd_context.json 完整路徑}\n\n請產出：任務清單（含依賴）、波次（DB→Backend→Frontend）、Agent 分配、可並行標記、DoD。使用 TaskCreate 建立任務。\n\nTDD 強制要求：每個任務必須定義 `tdd_plan` 區塊，包含 `test_file`（測試檔路徑）、`test_cases`（預期失敗的測試案例名稱列表）、`test_command`（執行測試的指令）。S4 會依此先寫測試再寫實作碼。無可測邏輯的任務（純 config/migration）須明確標記 `tdd_plan: null` 並附 `skip_justification`。",
  description: "S3 執行計畫"
)
```

完成後直接進入 Gate。

---

## Full Spec 模式

### Phase 1：architect 規劃

```
Task(
  subagent_type: "architect",
  model: "opus",
  prompt: "根據 brief_spec 和 dev_spec 產出執行計畫：\n\nBrief Spec：{S0}\nDev Spec：{S1}\nAPI Spec：{spec_folder}/s1_api_spec.md（若存在）\nSpec Review：{S2}\n\nsdd_context_path: {sdd_context.json 完整路徑}\n\n若 s1_api_spec.md 存在，後端 API 任務 DoD 須引用其 endpoint 規格。\n若 s1_frontend_handoff.md 存在且有分工邊界，純 UI 任務無後端依賴可排入與後端並行的波次；每個任務須填 `source_ref` 欄。\n\n請產出：任務清單（含依賴 + source_ref）、波次（Wave 1 DB → Wave 2 Domain/Service → Wave 3 API → Wave 4 Frontend Integration）、Agent 分配、可並行標記、DoD。使用 TaskCreate 建立任務。\n\n產出 Plan：{spec_folder}/s3_implementation_plan.md，模板 dev/specs/_templates/s3_implementation_plan_template.md\n\nTDD 強制要求：每個任務必須定義 `tdd_plan` 區塊，包含 `test_file`（測試檔路徑）、`test_cases`（預期失敗的測試案例名稱列表）、`test_command`（執行測試的指令）。S4 會依此先寫測試再寫實作碼。無可測邏輯的任務（純 config/migration）須明確標記 `tdd_plan: null` 並附 `skip_justification`。",
  description: "S3 執行計畫"
)
```

### Phase 2：驗證回合（並行）

> **目的**：交叉驗證 architect 產出的計畫，確保路徑正確、粒度合理、DoD 可測。

在**同一個 message** 發出驗證 Task，並行執行：

codebase-explorer (A) — 路徑與引用驗證
```
Task(
  subagent_type: "codebase-explorer",
  model: "sonnet",
  prompt: "驗證 {spec_folder}/s3_implementation_plan.md 的技術引用：\n\n1. 每個任務的「受影響檔案」路徑是否存在於 codebase\n2. 引用的 class/method/enum 名稱是否正確\n3. 依賴關係是否合理（被依賴任務的產出是否為依賴任務的輸入）\n\n報告格式：每個任務 ✅ / ❌ / ⚠️ + 具體問題描述",
  description: "S3 路徑驗證"
)
```

codebase-explorer (B) — DoD 覆蓋驗證
```
Task(
  subagent_type: "codebase-explorer",
  model: "sonnet",
  prompt: "讀取 {spec_folder}/s1_dev_spec.md 的 acceptance_criteria，對照 {spec_folder}/s3_implementation_plan.md：\n\n1. 每個 AC 是否被至少一個任務的 DoD 覆蓋\n2. 是否有任務 DoD 與 spec 不一致\n\n報告格式：AC-{N} → T{M} DoD 覆蓋 / 未覆蓋",
  description: "S3 DoD 覆蓋驗證"
)
```

codebase-explorer (C) — TDD 可測性驗證
```
Task(
  subagent_type: "codebase-explorer",
  model: "sonnet",
  prompt: "驗證 {spec_folder}/s3_implementation_plan.md 的 TDD Plan：\n\n1. 每個任務的 test_file 路徑是否符合專案測試目錄慣例\n2. test_command 是否可執行（grep repo 確認測試框架存在）\n3. 標記 tdd_plan: null 的任務是否確實無可測邏輯（檢查受影響檔案是否含函式/類別）\n\n報告格式：每個任務 ✅ / ❌ / ⚠️ + 具體問題描述",
  description: "S3 TDD 可測性驗證"
)
```

> **如有技術棧 Agent**，可並行發出更多驗證 Agent（DB 任務粒度、API 設計等）。

### Phase 3：驗證結果處理

| 情境 | 處理方式 |
|------|---------|
| **無 Critical** | 直接進入 S3 Gate |
| **Critical ≤ 3** | 調度 architect 單次修正 implementation plan |
| **Critical > 3** | 停下，呈現所有 Critical 問題，讓用戶裁決 |

#### 修正流程（Critical ≤ 3 時）

```
Task(
  subagent_type: "architect",
  model: "opus",
  prompt: "根據驗證反饋修正執行計畫：\n\n原始計畫：{s3_implementation_plan.md 路徑}\n\n驗證發現的 Critical 問題：\n{Critical 問題列表}\n\nsdd_context_path: {sdd_context.json 完整路徑}\n\n請修正計畫並更新 s3_implementation_plan.md。只修正被標記的問題，不要大幅重構計畫。",
  description: "S3 計畫修正"
)
```

> **安全閥**：修正最多 1 次。若修正後仍有 Critical，停下讓用戶裁決。

---

## 錯誤處理

| 情境 | 處理方式 |
|------|---------|
| Phase 2 某個驗證 Agent 失敗/超時 | **降級**：跳過該維度的驗證，在 Gate 報告中標記「⚠️ 未驗證」 |
| Phase 2 全部 Agent 失敗 | 視同無驗證，降級為 Quick 流程（直接進 Gate） |
| Phase 3 修正 Agent 失敗 | 保留原始計畫，標記未修正問題，呈現給用戶 |

---

## 任務流程

1. **任務拆解**：architect 使用 sequential-thinking 系統化規劃
2. **波次排序**：Wave 1 DB → Wave 2 Domain/Service → Wave 3 API → Wave 4 Frontend Logic → Wave 5 Frontend UI
3. **建立 TaskList**：TaskCreate 建立可追蹤任務
4. **產出 Plan**（Full Spec）：`{spec_folder}/s3_implementation_plan.md`，模板 `dev/specs/_templates/s3_implementation_plan_template.md`
5. **驗證方式**：每任務定義靜態分析/建置/測試的預期結果

> 同波次無依賴的任務標記可並行。每個任務必含：名稱、Agent、依賴、複雜度、DoD、受影響檔案、source_ref。

---

## SDD Context 持久化

> 操作手冊見 `.claude/references/sdd-context-persistence.md`（S3 區段）

S3 更新欄位：`stages.s3.status→pending_confirmation`、`output`（waves, total_tasks, estimated_waves）
`current_stage` **維持 S3**（必停 Gate，等用戶確認後由 S4 推進）

Full Spec 模式額外記錄：
- `stages.s3.output.verification_round`：驗證結果摘要
- `stages.s3.supporting_agents`：參與驗證的 Agent 列表
- `stages.s3.output.unverified_dimensions`：因降級跳過的維度（如有）

---

## S3 Gate

> Gate 行為依 `sdd_context.execution_mode` 決定。

### Autopilot 模式

📋 **摘要通知，自動繼續。**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 S3 執行計畫 — 自動繼續
   波次: {N} waves  任務: {N} tasks
   預估複雜度: {low/medium/high}
   模式: {Quick / Full Spec}
   → 開始 S4 實作...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Semi-Auto / Manual 模式

🔴 **必停！等待用戶確認執行計畫才開始寫碼。**

| 動作 | 說明 |
|------|------|
| ✅ 確認 | 輸入「繼續」開始寫碼 |
| ✏️ 調整 | 說明需要修改的部分 |
| ⏭️ 跳過 | 輸入「直接做」（不建議） |

**Gate 報告須包含**（Full Spec 模式）：
- 計畫摘要（波次數、任務數）
- 驗證狀態（通過/修正後通過/部分未驗證）
- 未驗證維度（如有）

**S4 會執行：**
1. 依波次順序 / 並行規則實作各任務
2. 根據任務類型分派 Agent
3. 每個任務走 TDD 三步驟：RED commit（失敗測試）→ GREEN commit（最少實作）→ REFACTOR commit（可選）
4. 靜態分析驗證
5. 完成後自動進入 S5 Code Review
