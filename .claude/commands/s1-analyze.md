---
description: "S1 技術分析 - 探索 codebase 並產出 dev_spec。僅在 SOP 管線內使用。觸發：S0 確認後自動進入、「分析影響範圍」"
allowed-tools: Read, Grep, Glob, Bash, Task, TaskCreate, TaskUpdate, TaskList, mcp__sequential-thinking__sequentialthinking, mcp__genaiToolbox__execute_sql, mcp__genaiToolbox__show_table_structure, mcp__genaiToolbox__list_tables
argument-hint: "<SDD-Context-JSON | 功能名稱>"
---

# S1 技術分析（探索 + 開發規格）

## 環境資訊
- 當前分支: !`git branch --show-current`

## 輸入
S0 輸出（brief_spec）：$ARGUMENTS

---

## Spec Mode 分流

讀取 sdd_context.json 的 `spec_mode` 欄位：

| Spec Mode | 流程 | 說明 |
|-----------|------|------|
| **Quick** | Phase 1 (explorer) → Phase 2 (architect) | 輕量流程 |
| **Full Spec** | Phase 1~5（Fan-out → Synthesis → Architect → Validation → Fix）| 多維度並行分析 |

---

## Quick 模式

### Phase 1：`codebase-explorer`（探索）

```
Task(
  subagent_type: "codebase-explorer",
  model: "sonnet",
  prompt: "根據以下 S0 brief_spec，分析 codebase 影響範圍：\n\n{brief_spec 內容}\n\n工作類型：{work_type}\n\nsdd_context_path: {sdd_context.json 完整路徑}\n\n請先執行 Phase 0 經驗掃描：\n- Grep dev/knowledge/pitfalls.md 找相關 tag\n- 掃描 dev/specs/*/sdd_context.json 的 lessons_learned\n\n然後根據 work_type 調整探索策略：\n- new_feature：影響範圍 + 可複用元件 + 架構模式\n- refactor：現狀深度分析 + 耦合點 + 測試覆蓋 + code smell\n- bugfix：root cause 追蹤 + 呼叫鏈反向追蹤 + git log 最近修改\n- investigation：多模組橫向掃描 + 假設逐一排除（可能建議轉型）\n\n識別影響範圍、架構模式、可重用元件、風險與依賴。\n\n報告開頭必須包含「## Phase 0 經驗掃描結果」區段，列出：搜尋到的相關 pitfalls（引用原文）、歷史 lessons_learned、若無相關項目明確寫「無相關歷史記錄」。",
  description: "S1 代碼探索"
)
```

**如涉及 DB**，額外並行調度 DB 分析 Agent。

### Phase 2：`architect`（規格撰寫）

```
Task(
  subagent_type: "architect",
  model: "opus",
  prompt: "根據 brief_spec 和探索結果撰寫 dev_spec：\n\nBrief Spec：{內容}\nCodebase 探索：{Phase 1 報告}\n歷史 Pitfalls：{相關清單}\n工作類型：{work_type}（修正後：{work_type_revised}）\n\nsdd_context_path: {sdd_context.json 完整路徑}\n\n請根據 work_type 調整設計重點：\n- new_feature：完整 User Flow + Data Flow + 任務拆解\n- refactor：加入「現狀分析」區段（before/after + 遷移路徑 + 回歸風險矩陣）\n- bugfix：加入「Root Cause 分析」區段（root cause + 修復方案 + 防禦措施）\n- investigation：簡化為調查報告（假設驗證表 + 發現摘要 + 行動建議）；若已轉型按新類型產出\n\n請設計技術方案：User Flow、Data Flow、API 設計、任務拆解+DoD、驗收標準（Given-When-Then）、風險評估（必須包含相關 pitfalls）。",
  description: "S1 開發規格撰寫"
)
```

完成後自動進入 S2。

---

## Full Spec 模式

### 條件分發邏輯

在 Phase 1 Fan-out 前，讀取 `s0.output` 判斷需要哪些領域 Agent：

| 條件 | 判斷依據 | 額外 Agent |
|------|---------|-----------|
| 涉及 DB | 關鍵字：migration, 資料庫, schema, 欄位, 表, model, entity, DB | DB 領域 Agent |
| 涉及特定領域 | 依 CLAUDE.md 中定義的技術棧 Agent | 對應領域 Agent |

至少 `codebase-explorer` 必定參與。

### Phase 1：Fan-out 並行探索

> **目的**：多維度並行掃描 codebase，取得各領域的分析報告。

在**同一個 message** 發出所有 Task，並行執行：

#### 必定調度：codebase-explorer

```
Task(
  subagent_type: "codebase-explorer",
  model: "sonnet",
  prompt: "根據以下 S0 brief_spec，分析 codebase 影響範圍：\n\n{brief_spec 內容}\n\n工作類型：{work_type}\n\nsdd_context_path: {sdd_context.json 完整路徑}\n\n請先執行 Phase 0 經驗掃描：\n- Grep dev/knowledge/pitfalls.md 找相關 tag\n- 掃描 dev/specs/*/sdd_context.json 的 lessons_learned\n\n然後根據 work_type 調整探索策略。\n\n識別影響範圍、架構模式、可重用元件、風險與依賴。\n\n報告開頭必須包含「## Phase 0 經驗掃描結果」區段。\n報告結尾必須包含「## 影響範圍摘要」，列出所有受影響的模組與檔案。",
  description: "S1 Fan-out 代碼探索"
)
```

#### 條件調度：領域 Agent（與上方並行）

> 依 CLAUDE.md 定義的技術棧 Agent 動態分發。只有 `codebase-explorer` 傳 `sdd_context_path`（避免 race condition）。

### Phase 2：Orchestrator 合成

> **目的**：Skill 自身讀取所有 Fan-out 報告，合併為統一的 synthesized_analysis。

**合成步驟**：

1. **收集報告**：讀取 Phase 1 所有 Agent 的回傳結果
2. **按主題合併影響範圍**：去重合併所有 Agent 提及的模組/檔案
3. **矛盾偵測**：影響範圍/風險等級不一致 → 保留雙方，標記 `⚠️ 矛盾`
4. **空缺偵測**：某維度未分析 → 標記 `⚠️ Gap`
5. **產出 synthesized_analysis markdown**（傳給 Phase 3 architect）

### Phase 3：architect 規格撰寫

```
Task(
  subagent_type: "architect",
  model: "opus",
  prompt: "根據 brief_spec 和多維度分析結果撰寫 dev_spec：\n\nBrief Spec：{內容}\n\n=== 合成分析報告 ===\n{synthesized_analysis}\n\n=== 矛盾項目 ===\n{contradictions 列表}\n\n=== 空缺項目 ===\n{gaps 列表}\n\n歷史 Pitfalls：{pitfalls}\n工作類型：{work_type}\n\nsdd_context_path: {sdd_context.json 完整路徑}\n\n**額外要求**（Full Spec）：\n1. 在「技術決策」中逐一裁決矛盾項目\n2. 在「風險評估」中標記空缺為已知盲區\n3. 影響範圍使用合成報告的合併結果\n\n**額外文件產出**：\n- 涉及 API 變更時：依 s1_api_spec_template.md 產出 s1_api_spec.md\n- 涉及前端任務時：依 s1_frontend_handoff_template.md 產出 s1_frontend_handoff.md",
  description: "S1 開發規格撰寫"
)
```

### Phase 4：交叉驗證

codebase-explorer — 規格引用驗證
```
Task(
  subagent_type: "codebase-explorer",
  model: "sonnet",
  prompt: "驗證 dev_spec 中引用的所有技術實體是否存在於 codebase：\n\n1. 讀取 {spec_folder}/s1_dev_spec.md\n2. 提取所有引用的 class / method / endpoint / table / enum 名稱\n3. 使用 Grep + Glob 驗證每個名稱是否存在\n4. 報告格式：\n   - ✅ 存在：{名稱} → {檔案路徑}\n   - ❌ 不存在：{名稱}（預期位置：{推測路徑}）\n   - ⚠️ 近似匹配：{名稱} → 實際名稱 {actual}（{檔案路徑}）",
  description: "S1 規格交叉驗證"
)
```

> **如有技術棧 Agent**，可並行發出多個驗證 Agent（API 設計驗證、業務邏輯驗證等）。

### Phase 5：驗證結果處理

| 情境 | 處理方式 |
|------|---------|
| **無 Critical** | 自動推進到 S2 |
| **Critical ≤ 3** | 調度 architect 單次修正 dev_spec |
| **Critical > 3** | 停下，呈現所有 Critical 問題，讓用戶裁決 |

> **安全閥**：修正最多 1 次。若修正後仍有 Critical，停下讓用戶裁決。

---

## 錯誤處理

| 情境 | 處理方式 |
|------|---------|
| Phase 1 條件 Agent 失敗/超時 | **降級**：標記該維度為「⚠️ 未分析」，繼續 |
| Phase 1 codebase-explorer 失敗 | **阻斷**：必要 Agent，報錯並停止 |
| Phase 4 驗證 Agent 失敗/超時 | **降級**：跳過該維度，標記「⚠️ 未驗證」 |
| Phase 5 修正 Agent 失敗 | 保留原始 dev_spec，呈現給用戶 |

---

## 任務流程

1. **Phase 0 經驗掃描**：codebase-explorer 先掃 pitfalls.md + 歷史 lessons_learned
2. **Phase 1 Fan-out 探索**：多 Agent 並行掃描（Quick: 串行 / Full Spec: 並行）
3. **Phase 2 合成**（Full Spec）：Orchestrator 合併分析報告、偵測矛盾與空缺
4. **Phase 3 技術方案**：architect 基於合成結果設計方案、裁決矛盾
5. **Phase 4 驗證**（Full Spec）：交叉驗證 dev_spec 引用正確性
6. **Phase 5 修正**（Full Spec，如需要）：architect 修正 Critical 問題
7. **產出 Dev Spec**：`{spec_folder}/s1_dev_spec.md`
8. **產出 API Spec**（涉及 API 變更時）：`{spec_folder}/s1_api_spec.md`
9. **產出 Frontend Handoff**（涉及前端任務時）：`{spec_folder}/s1_frontend_handoff.md`

> Full Spec 必備：概述、User Flow（Mermaid）、Data Flow（Sequence Diagram、API 契約）、任務清單+DoD+Agent、技術決策（含矛盾裁決）、驗收標準、風險（含空缺盲區）

---

## SDD Context 持久化

> 操作手冊見 `.claude/references/sdd-context-persistence.md`（S1 區段）

S1 開始時（Phase 1）：更新 `stages.s0.status` → `completed`

S1 更新欄位：`stages.s1.status→completed`、`agents`、`output`（dev_spec_path, api_spec_path（可選）, frontend_handoff_path（可選）, impact_scope, tasks, acceptance_criteria, risks, unknowns）
推進：`current_stage` → S2

Full Spec 模式額外記錄：
- `stages.s1.supporting_agents`：參與 fan-out 和 validation 的 Agent 列表
- `stages.s1.output.completed_phases`：依實際完成情況
- `stages.s1.output.synthesis_summary`：合成報告摘要（矛盾數、空缺數）
- `stages.s1.output.validation_summary`：驗證結果摘要（Critical 數、修正狀態）
- `stages.s1.output.unverified_dimensions`：因降級跳過的維度（如有）

---

## S1 Gate

- **Semi-Auto**：輸出 dev_spec 後 🟢 **自動進入 S2 Spec Review**
- **Manual**：輸入「繼續」進入 S2 / 輸入補充需求追加分析
