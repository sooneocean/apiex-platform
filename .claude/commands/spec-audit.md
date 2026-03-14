---
description: "Spec 深度審計 — 6 Agent 並行比對 Brief/Dev Spec 與 codebase 的完整性，含 User Flow 端到端追蹤、Test Coverage 審計與跨層交叉驗證。Use when 需要驗證 spec 與 code 一致性、追蹤 flow 完整性、檢查覆蓋率。Do NOT use when 只需單點事實確認（用 /verify）、或 code 品質審查（用 /code-review）。觸發：「審計 spec」「audit spec」「spec vs code」「追蹤 flow」「深度比對」「spec 覆蓋率」"
allowed-tools: Read, Grep, Glob, Bash, Task, mcp__sequential-thinking__sequentialthinking
argument-hint: "<spec 目錄路徑>"
---

# Spec 深度審計（6-Agent 並行引擎）

> 核心差異：不只查「X 存不存在」，而是追蹤 User Flow 端到端路徑 + 跨層交叉驗證。
> 報告格式：見 Phase 4 輸出定義

## 環境資訊
- 當前分支: !`git branch --show-current`

## 輸入
- Spec 目錄路徑：$ARGUMENTS
- 若無引數，提示用戶提供 `dev/specs/{folder}/` 路徑

---

## 雙入口模式

| 模式 | 觸發方式 | 輸出 |
|------|---------|------|
| **獨立模式** | `/spec-audit dev/specs/2026-xx-xx_feature/` | 控制台 Markdown + 可選寫入 `{spec_folder}/audit/` |
| **S5 整合模式** | 由 s5-review.md 內部調用 | 回傳 JSON 結構供 S5 寫入 sdd_context |

**判斷方式**：檢查呼叫上下文。若由 S5 Skill 調用（上下文含 `s5-review` 或 `spec_verification`），進入整合模式；否則為獨立模式。

---

## Phase 1：解析 Spec — 提取可審計項

1. **讀取 Spec 文件**：
   - `{spec_folder}/s0_brief_spec.md`（必須）
   - `{spec_folder}/s1_dev_spec.md`（必須）
   - `{spec_folder}/sdd_context.json`（必須）
   - `{spec_folder}/s1_api_spec.md`（若存在）

2. **用 sequential-thinking 拆解為 6 維度審計清單**：

   提示語：
   ```
   分析以下 Spec 文件，拆解為 5 個維度的可審計項目清單：

   **D1 Frontend**（來源：S0 §6 scope_in 前端項 + S0 §10 影響範圍前端 + S1 tasks 前端）
   **D2 Backend**（來源：S0 §6 scope_in 後端項 + S0 §10 影響範圍後端 + S1 tasks 後端）
   **D3 Database**（來源：S0 §6 scope_in DB 項 + S0 §10 影響範圍 DB + S1 tasks DB）
   **D4 User Flow**（來源：S0 §4 mermaid 流程圖的每條路徑，拆為獨立 Flow）
   **D5 Business Logic**（來源：S0 §4 異常表 + §7 約束 + §9 Data Flow 箭頭）
   **D6 Test Coverage**（來源：S0 §4 異常表 + S1 acceptance_criteria + S0 §7 約束條件）

   額外：將 S0 §5 成功標準拆解到各維度作為錨點（不獨立成維度）。

   每個審計項需包含：
   - 維度（D1~D5）
   - 審計項 ID（暫用序號）
   - 描述（具體到可 Grep 的粒度）
   - 來源（Spec 段落引用）
   - 錨定的成功標準（若有）
   ```

3. **產出**：6 維度審計清單 JSON，作為 Phase 2 的輸入分發給各 Agent。

---

## Phase 2：6-Agent 並行調度

> 同一 message 發出全部 6 個 Agent，最大化並行度。

### Agent A：Frontend 審計

```
Agent(
  subagent_type: "Explore",
  model: "sonnet",
  prompt: "## Frontend 深度審計

你是前端審計員。基於以下 D1 審計清單，在 codebase 中逐項驗證：

> **適配指引**：根據專案技術棧（見 CLAUDE.md Repo 特化守則），自動適配搜尋路徑和技術術語。

{D1 審計清單}

**驗證方法**：
1. 每個 scope_in 前端項 → Grep/Glob 在前端原始碼目錄下搜尋對應實作
2. 前端狀態管理機制是否與 spec 定義一致
3. UI 元件是否遵循專案設計系統
4. API 調用側：是否用專案的 API Client 呼叫方式，endpoint 路徑是否正確

**產出格式**（JSON）：
{
  'dimension': 'd1_frontend',
  'findings': [
    {
      'id': 'SA-D1-001',
      'item': '審計項描述',
      'status': 'passed | partial | failed',
      'evidence': 'file:line 或搜尋結果',
      'severity': 'P0 | P1 | P2',
      'note': '備註'
    }
  ],
  'summary': { 'total': N, 'passed': N, 'partial': N, 'failed': N }
}

純讀取，不修改檔案。",
  description: "SA-D1 Frontend 審計"
)
```

### Agent B：Backend 審計

```
Agent(
  subagent_type: "Explore",
  model: "sonnet",
  prompt: "## Backend 深度審計

你是後端審計員。基於以下 D2 審計清單，在 codebase 中逐項驗證：

> **適配指引**：根據專案技術棧（見 CLAUDE.md Repo 特化守則），自動適配搜尋路徑和技術術語。

{D2 審計清單}

**驗證方法**：
1. 每個 scope_in 後端項 → Grep/Glob 在後端原始碼目錄下搜尋對應實作
2. 後端路由/Endpoint 是否存在且 HTTP method 正確
3. Service 方法是否實作了 spec 定義的業務邏輯
4. 資料存取層是否有對應實作
5. Transaction 邊界是否正確

**產出格式**（JSON）：
{
  'dimension': 'd2_backend',
  'findings': [...],  // 同 D1 格式，ID 前綴 SA-D2-
  'summary': { 'total': N, 'passed': N, 'partial': N, 'failed': N }
}

純讀取，不修改檔案。",
  description: "SA-D2 Backend 審計"
)
```

### Agent C：Database 審計

```
Agent(
  subagent_type: "Explore",
  model: "sonnet",
  prompt: "## Database 深度審計

你是資料庫審計員。基於以下 D3 審計清單，驗證：

> **適配指引**：根據專案技術棧（見 CLAUDE.md Repo 特化守則），自動適配搜尋路徑和技術術語。

{D3 審計清單}

**驗證方法**：
1. 確認表結構與 spec 要求一致
2. ORM Entity/Model 屬性是否與 DB schema 一致
3. Migration 是否涵蓋 spec 要求的 schema 變更
4. Index 是否為查詢場景設計
5. FK 關係是否正確

> 若專案有 genaiToolbox MCP 工具可用，優先使用 `show_table_structure` 和 `execute_sql` 驗證。否則透過讀取 migration 檔案和 ORM Entity 定義驗證。

**產出格式**（JSON）：
{
  'dimension': 'd3_database',
  'findings': [...],  // ID 前綴 SA-D3-
  'summary': { 'total': N, 'passed': N, 'partial': N, 'failed': N }
}

純讀取，不修改檔案或資料庫。",
  description: "SA-D3 Database 審計"
)
```

### Agent D：User Flow 端到端追蹤（核心差異化）

```
Agent(
  subagent_type: "Explore",
  model: "sonnet",
  prompt: "## User Flow 端到端追蹤

你是 User Flow 追蹤員。這是本審計引擎的**核心差異化能力**。

> **適配指引**：根據專案技術棧（見 CLAUDE.md Repo 特化守則），自動適配搜尋路徑和技術術語。

基於以下 D4 審計清單（每條 Flow），追蹤完整鏈路：

{D4 審計清單 — 每條 Flow 的節點序列}

**追蹤方法**（逐步標記）：
對每條 Flow，追蹤以下完整鏈路：
1. UI 按鈕/觸發點 → 找到 Widget 中的 onPressed/onTap
2. BLoC Event → 確認 Event class 存在且被 add()
3. BLoC Handler → 確認 on<Event> handler 存在
4. API 呼叫 → 確認 ApiClient 調用的 endpoint
5. Controller → 確認 route 存在且接收正確參數
6. Service → 確認業務邏輯方法被調用
7. Repository → 確認資料存取
8. DB 操作 → 確認 Entity/Table 被正確操作
9. Response → 確認回傳 DTO 結構
10. 通知 → 確認是否需要發送通知（若 spec 要求）
11. UI 更新 → 確認 State 變更觸發 UI rebuild

每步標記：✅ 已實作且鏈路連通 / ⚠️ 實作存在但鏈路可能斷裂 / ❌ 缺失

**產出格式**（JSON）：
{
  'dimension': 'd4_user_flow',
  'flows': [
    {
      'flow_id': 'FLOW1',
      'name': 'Flow 描述',
      'steps': [
        { 'step': 1, 'name': 'UI 觸發', 'status': 'passed|partial|failed', 'evidence': 'file:line', 'note': '' },
        ...
      ],
      'overall_status': 'passed | partial | failed'
    }
  ],
  'findings': [
    {
      'id': 'SA-D4-FLOW1-001',
      'flow': 'FLOW1',
      'step': 3,
      'status': 'failed',
      'description': 'BLoC handler 未調用 Service',
      'evidence': 'file:line',
      'severity': 'P1'
    }
  ],
  'summary': { 'total': N, 'passed': N, 'partial': N, 'failed': N }
}

純讀取，不修改檔案。",
  description: "SA-D4 User Flow 追蹤"
)
```

### Agent E：Business Logic 審計

```
Agent(
  subagent_type: "Explore",
  model: "sonnet",
  prompt: "## Business Logic 深度審計

你是業務邏輯審計員。基於以下 D5 審計清單，驗證：

> **適配指引**：根據專案技術棧（見 CLAUDE.md Repo 特化守則），自動適配搜尋路徑和技術術語。

{D5 審計清單}

**驗證方法**：
1. S0 §4 異常表的每個異常 → 確認 code 有對應 error handling
2. S0 §7 約束條件 → 確認 code 有對應 validation/guard
3. S0 §9 Data Flow 箭頭 → 確認 DTO 在各層傳遞的欄位一致性
4. 邊界情境 → 確認 edge case 有被處理（null, empty, max, concurrent）

**特別關注跨層 DTO 一致性**：
- Frontend DTO vs Backend DTO 欄位名稱、型別是否對應
- Request body 欄位是否與後端接收的 model 一致
- Response DTO 是否與前端解析一致

**產出格式**（JSON）：
{
  'dimension': 'd5_business_logic',
  'findings': [...],  // ID 前綴 SA-D5-
  'summary': { 'total': N, 'passed': N, 'partial': N, 'failed': N }
}

純讀取，不修改檔案。",
  description: "SA-D5 Business Logic 審計"
)
```

### Agent F：Test Coverage 審計

```
Agent(
  subagent_type: "Explore",
  model: "sonnet",
  prompt: "## Test Coverage 深度審計

你是測試覆蓋審計員。基於以下邊界情境清單（來自 D5）和驗收標準（來自 S1），
在 test 目錄中逐項比對是否有對應 test case：

> **適配指引**：根據專案技術棧（見 CLAUDE.md Repo 特化守則），自動適配搜尋路徑和技術術語。

{D5 邊界情境清單}
{S1 acceptance_criteria 清單}

**驗證方法**：
1. S0 §4 異常表每條 → Grep 專案測試目錄找對應 test method
   （測試方法名稱或描述）
2. S1 acceptance_criteria 每個 Given-When-Then → 找對應 test case
3. S0 §7 約束條件 → 找對應邊界 test case
4. 金錢/安全/資料完整性相關路徑 → 強制要求 test 存在（無 test → P1）

**判定規則**：
- 有明確對應 test → passed
- 有 test 但只覆蓋 happy path → partial
- 無任何 test → failed（金錢/安全路徑自動升 P1）

**產出格式**（JSON）：
{
  'dimension': 'd6_test_coverage',
  'findings': [
    {
      'id': 'SA-D6-001',
      'spec_item': 'AC 或 edge case 描述',
      'source': 'acceptance_criteria | edge_case | constraint',
      'test_file': 'path/to/test 或 null',
      'test_method': 'test method name 或 null',
      'status': 'passed | partial | failed',
      'severity': 'P0 | P1 | P2',
      'note': ''
    }
  ],
  'summary': { 'total': N, 'passed': N, 'partial': N, 'failed': N }
}

純讀取，不修改檔案。",
  description: "SA-D6 Test Coverage 審計"
)
```

### 並行降級策略

> 複用 explore.md pattern。

| 情境 | 處理 |
|------|------|
| Agent 120s 內返回 | 正常收集結果 |
| Agent 超時 | retry 1x（model: opus） |
| retry 仍失敗 | 該維度標記 `[DEGRADED]`，用已完成結果繼續 |
| 全部 6 Agent 失敗 | 回退至淺層 Grep（見下方） |

**淺層 Grep 回退**：
- D1~D3：僅 Grep scope_in 項目是否在 codebase 中有對應檔案/class
- D4：跳過端到端追蹤，僅確認 Flow 起點和終點存在
- D5：僅 Grep 約束關鍵字是否出現在 code 中
- 報告標記 `audit_engine_status: "unavailable"`

---

## Phase 3：交叉驗證矩陣（Orchestrator 執行）

> 6 Agent 全部返回後，由 Orchestrator（主控）執行交叉驗證。

### 3.1 Frontend x Backend：API 契約一致性

- 從 Agent A 提取前端 API 調用的 endpoint + request/response 結構
- 從 Agent B 提取後端 Controller route + DTO 結構
- 比對：
  - endpoint 路徑是否一致
  - HTTP method 是否一致
  - Request DTO 欄位是否對應
  - Response DTO 欄位是否對應
- 不一致 → `SA-CROSS-API-{NNN}`

### 3.2 Backend x Database：Entity-Table 一致性

- 從 Agent B 提取 ORM Entity/Model 屬性
- 從 Agent C 提取 DB schema 欄位
- 比對：
  - 屬性名稱 vs 欄位名稱（考慮 naming convention 差異）
  - 型別對應是否正確
  - nullable 設定是否一致
- 不一致 → `SA-CROSS-DB-{NNN}`

### 3.3 User Flow x Business Logic：邊界覆蓋

- 從 Agent D 提取所有 Flow 路徑
- 從 Agent E 提取所有邊界情境
- 比對：每個邊界情境是否落在某條 Flow 路徑上
  - 有對應 Flow → 覆蓋
  - 無對應 Flow → 孤兒邊界（orphaned edge case）
- 孤兒 → `SA-CROSS-FLOW-{NNN}`

### 3.4 邊界情境 x Test Case：測試覆蓋交叉
- 從 Agent E 提取所有邊界情境
- 從 Agent F 提取所有 test case 映射
- 比對：
  - 邊界情境有 code 處理 + 有 test → 完整覆蓋
  - 邊界情境有 code 處理 + 無 test → 未測試邊界（SA-CROSS-TEST-{NNN}）
    - 金錢/安全路徑 → P1
    - 其他 → P2
  - 邊界情境無 code 處理 + 無 test → 由 D5 報告（SA-D5-{NNN}）

### 3.5 成功標準錨定

- 讀取 Phase 1 拆解的成功標準 ↔ 維度映射
- 對每條 S0 §5 成功標準：
  - 檢查所有關聯的維度子項是否全部 ✅
  - 全部 ✅ → 標準通過
  - 任一 ⚠️ → 標準部分達成
  - 任一 ❌ → 標準未達成

---

## Phase 4：覆蓋報告

### 4.1 獨立模式輸出

依以下結構產出 Markdown 報告：

1. **審計摘要**：spec 路徑、日期、6 Agent 狀態
2. **6 維度覆蓋矩陣**：D1~D6 各維度 pass/partial/fail 計數 + 百分比
3. **交叉驗證結果**：API 契約、Entity-Table、Flow-EdgeCase、Test Coverage
4. **成功標準錨定表**：每條 S0 §5 標準 x D1~D6 狀態 → 綜合結果
5. **User Flow 追蹤明細**：每條 Flow 的端到端步驟追蹤表
6. **Gap List**：按 P0→P1→P2 排序的缺口清單
7. **證據索引**：全部 findings 的 file:line

輸出到控制台（Markdown）。Phase 5 自動持久化到 `{spec_folder}/audit/`。

### 4.2 S5 整合模式輸出

回傳 JSON 結構供 S5 寫入 sdd_context：

```json
{
  "s0_criteria": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
  "dimensions": {
    "d1_frontend": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
    "d2_backend": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
    "d3_database": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
    "d4_user_flow": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
    "d5_business_logic": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
    "d6_test_coverage": { "total": 0, "passed": 0, "partial": 0, "failed": 0 }
  },
  "cross_validation": {
    "api_contract": { "total": 0, "consistent": 0, "inconsistent": 0 },
    "entity_table": { "total": 0, "consistent": 0, "inconsistent": 0 },
    "flow_edge_case": { "total": 0, "covered": 0, "orphan": 0 },
    "test_coverage": { "total": 0, "covered": 0, "missing": 0 }
  },
  "engine_status": "completed | degraded | unavailable",
  "findings_summary": { "p0": 0, "p1": 0, "p2": 0, "total": 0 },
  "issues": [
    {
      "id": "SA-D1-001",
      "source": "spec_audit_d1",
      "dimension": "frontend",
      "description": "...",
      "status": "failed",
      "severity": "P1",
      "evidence": "file:line"
    }
  ]
}
```

---

## Phase 5：Persist & Track

> Phase 4 報告產出後，自動持久化審計結果。

### 5.1 建立 Audit 資料夾

```bash
mkdir -p {spec_folder}/audit/history
```

若 `{spec_folder}/audit/` 已存在，跳過建立。

### 5.2 寫入固定路徑（最新結果）

1. **`{spec_folder}/audit/spec_audit_report.md`** ← Phase 4 產出的完整 Markdown 報告（覆蓋寫入）
2. **`{spec_folder}/audit/audit_summary.json`** ← 從報告提取的摘要 JSON（覆蓋寫入）

`audit_summary.json` 結構：

```json
{
  "audit_id": "SA-{YYYY-MM-DDTHH-MM-SS}",
  "timestamp": "ISO8601（含時區）",
  "trigger": "standalone | s5_integration",
  "engine_status": "completed | degraded | unavailable",
  "spec_folder": "{spec_folder}",
  "dimensions": {
    "d1_frontend": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
    "d2_backend": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
    "d3_database": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
    "d4_user_flow": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
    "d5_business_logic": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
    "d6_test_coverage": { "total": 0, "passed": 0, "partial": 0, "failed": 0 }
  },
  "cross_validation": {
    "api_contract": { "total": 0, "consistent": 0, "inconsistent": 0 },
    "entity_table": { "total": 0, "consistent": 0, "inconsistent": 0 },
    "flow_edge_case": { "total": 0, "covered": 0, "orphan": 0 },
    "test_coverage": { "total": 0, "covered": 0, "missing": 0 }
  },
  "findings_summary": { "p0": 0, "p1": 0, "p2": 0, "total": 0 },
  "report_path": "{spec_folder}/audit/spec_audit_report.md"
}
```

### 5.3 寫入歷史快照

1. 產生時間戳：`YYYY-MM-DDTHH-MM-SS`（去冒號，資料夾名安全）
2. 建立 `{spec_folder}/audit/history/{timestamp}/`
3. 複製 `spec_audit_report.md` + `audit_summary.json` 到該子目錄

### 5.4 回寫 sdd_context.json

1. **讀取** `{spec_folder}/sdd_context.json`
2. **初始化**：若 `audit_history` 不存在，建立為空陣列 `[]`
3. **Append** 一筆到 `audit_history[]`（結構同 `audit_summary.json`，去掉 `spec_folder` 欄位）
4. **S5 整合模式額外步驟**：若 `trigger == "s5_integration"`，同時寫入 `stages.s5.output.spec_audit`（結構同 audit_summary，去掉 `spec_folder` 和 `timestamp`）
5. **更新** `last_updated` + `last_updated_by: "claude"`
6. **寫回** 檔案

### 5.5 輸出追蹤摘要

在控制台輸出：

```
--- Audit Persisted ---
Report:  {spec_folder}/audit/spec_audit_report.md
History: {spec_folder}/audit/history/{timestamp}/
Context: sdd_context.audit_history[{N}] appended
Total:   {count} audit(s) recorded
```

### S5 整合 vs 獨立模式差異

| 行為 | 獨立模式 | S5 整合模式 |
|------|---------|------------|
| trigger 值 | `standalone` | `s5_integration` |
| audit_history append | Yes | Yes |
| s5.output.spec_audit 寫入 | No | Yes |
| 報告輸出 | Markdown 到控制台 + audit/ | JSON 回傳 + audit/ |
| Phase 5 輸出 | 控制台追蹤摘要 | 靜默（結果已在 JSON 中） |

---

## Finding ID 命名規範

| 前綴 | 維度 | 範例 |
|------|------|------|
| `SA-D1-{NNN}` | Frontend | SA-D1-001 |
| `SA-D2-{NNN}` | Backend | SA-D2-003 |
| `SA-D3-{NNN}` | Database | SA-D3-001 |
| `SA-D4-FLOW{N}-{NNN}` | User Flow（Flow 編號 + 步驟） | SA-D4-FLOW2-005 |
| `SA-D5-{NNN}` | Business Logic | SA-D5-002 |
| `SA-CROSS-API-{NNN}` | 前端 x 後端交叉 | SA-CROSS-API-001 |
| `SA-CROSS-DB-{NNN}` | 後端 x DB 交叉 | SA-CROSS-DB-001 |
| `SA-CROSS-FLOW-{NNN}` | Flow x 邊界交叉 | SA-CROSS-FLOW-001 |
| `SA-D6-{NNN}` | Test Coverage | SA-D6-001 |
| `SA-CROSS-TEST-{NNN}` | 邊界 x Test 交叉 | SA-CROSS-TEST-001 |

---

## 注意事項

- **純讀取**：整個審計過程不修改任何 codebase 檔案
- **證據導向**：每個 finding 必須附帶 `file:line` 或具體搜尋結果
- **不重複 S5 R1~R3**：本引擎關注 Spec↔Code 一致性 + Test↔Spec 覆蓋率，不做 code quality 審查（那是 R1 的職責）
- **S5 整合時**：SC-S0/SC-SCOPE/SC-DOD 前綴的舊 findings 由引擎內部映射，對外統一用 SA- 前綴
