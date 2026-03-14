---
description: "S4 實作階段 - 依據執行計畫進行程式碼實作。僅在 SOP 管線內使用。觸發：S3 確認後進入、「實作」、「開始寫」"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Task, TaskCreate, TaskUpdate, TaskList, TaskGet, mcp__sequential-thinking__sequentialthinking, mcp__genaiToolbox__execute_sql
argument-hint: "<SDD-Context-JSON | 任務編號>"
---

# S4 實作

## 環境資訊
- 當前分支: !`git branch --show-current`
- 變更狀態: !`git status --porcelain | head -10`

## 輸入
S0~S3 輸出或任務編號：$ARGUMENTS

---

## Agent 調度

> **Manifest-Aware**：讀取 `.claude/manifest.json` 確認可用 agents。有 stack-specific agent 就 dispatch，沒有就由 Orchestrator 直接按 DoD 實作。

### 核心 Agent（始終可用）

| 任務類型 | Agent | 判斷依據 |
|---------|-------|---------|
| 錯誤排查 | `debugger` | 遇到錯誤或異常時 |

### Stack-Specific Agent（依安裝 stack 而定）

以下 agent 僅在對應技術棧已安裝時可用。**未安裝時由 Orchestrator 直接實作**，不需額外 agent。

| 任務類型 | Agent | 需要 Stack | 判斷依據 |
|---------|-------|-----------|---------|
| 資料層分析 | `sql-expert` | database | Schema 設計、索引規劃 |
| 資料層實作 | `dotnet-expert` | dotnet | Entity, Migration, DbContext |
| 後端邏輯/API | `dotnet-expert` | dotnet | Service, Controller, DTO |
| 前端邏輯/UI | `flutter-expert` | flutter | BLoC, Page, Widget |

### Dispatch 範例

```
# Stack agent 存在時 — dispatch 給專家（TDD 驅動）
Task(subagent_type: "{agent-name}", model: "sonnet", prompt: "實作任務：{描述}\nDoD：{完成標準}\nTDD Plan：{tdd_plan}\nsdd_context_path: {路徑}\ntask_id: {任務ID}\n\n必須遵循 TDD 三步驟：\n1. RED：根據 TDD Plan 寫失敗測試 → 執行 {test_command} → 必須 FAIL → git commit test(red)\n2. GREEN：寫最少程式碼讓測試通過 → 執行 {test_command} → 必須 PASS → git commit feat(green)\n3. REFACTOR（可選）：重構 → 執行測試 → 必須 PASS → git commit refactor\n\n回傳 tdd_evidence JSON（含 red/green 的 test_command, exit_code, output_summary, commit_hash, timestamp）", description: "S4 TDD 實作")

# Stack agent 不存在時 — Orchestrator 直接 TDD 實作
# 不調度 subagent，自行按 TDD 三步驟完成任務

# 錯誤時（始終可用）
Task(subagent_type: "debugger", model: "sonnet", prompt: "診斷錯誤：{錯誤訊息}", description: "S4 錯誤診斷")
```

> **Wave 協作（需 database + dotnet stack）**：sql-expert 設計 Schema 規格 → dotnet-expert 建立 Entity/Migration → sql-expert 驗證。無 stack agent 時由 Orchestrator 依序處理。

---

## 任務流程（TDD 驅動）

1. **讀取 TaskList**：找到 pending 任務，標記 in_progress，選擇 Agent
2. **TDD Cycle**（每個任務）：
   - **Step 1 RED**：根據 S3 tdd_plan 寫測試 → 執行測試指令 → **MUST FAIL** → 截取 output → `git commit -m "test(red): T{N} {描述}"`
   - **Step 2 GREEN**：寫最少實作碼讓測試通過 → 執行測試指令 → **MUST PASS** → 截取 output → `git commit -m "feat(green): T{N} {描述}"`
   - **Step 3 REFACTOR**（可選）：改善程式碼結構（不改行為）→ 執行測試 → **MUST STILL PASS** → `git commit -m "refactor: T{N} {描述}"`
3. **Mini-Review**（Full Spec）：spawn subagent 檢查 DoD + 品質
4. **記錄變更**：追蹤變更檔案，更新 `s3_implementation_plan.md`（Full Spec）

> **TDD 安全閥**：
> - Step 1 測試意外通過 → 測試無效，重寫（最多 2 次），仍通過 → 標記 `tdd_skip_reason: "test_already_passing"`
> - Step 2 實作後測試仍失敗 → 最多修 3 次，超過 → 調度 debugger
> - 純 config/migration 任務 → Agent 必須先嘗試寫測試，確認無可測邏輯後才可標記 `tdd_skip_reason: "no_testable_logic"`
>
> **持久化責任**：
> - **串行任務**：Agent 自寫 sdd_context.json（Skill 傳 sdd_context_path + task_id）
> - **並行任務**：Skill 不傳 sdd_context_path，所有 Agent 回傳後由 Skill 統一寫入
> - **plan 文件**由 S4 主上下文更新，不是 subagent
>
> **同波次可並行**：S3 標記可並行的任務使用多個 Task 同時調度。
> **完成定義**：TDD 證據完整（red + green commit pair）+ 所有測試通過。

---

## Per-Task Mini-Review（Full Spec 模式）

> 每個任務完成後，spawn fresh subagent 做 2-point 快速攔截（DoD 符合度 + 明顯品質問題）。
> 啟用條件：`spec_mode == "full"`。Quick 模式跳過（S5 全面審查即足夠）。

### 每個任務完成後

1. **建置驗證**（既有步驟，不變）
2. **Mini-Review**（新增）：

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "你是逐任務快速審查員。檢查以下任務實作：\n\n任務：{描述}\nDoD：{完成標準}\n變更檔案：{changes}\n\n僅檢查兩項：\n1. Spec 符合度：DoD 每條是否滿足？\n2. 明顯品質問題：空指標、未處理錯誤、明顯邏輯漏洞？\n\n輸出 JSON：\n{ verdict: \"pass|flag\", issues: [{severity:\"P1|P2\", description, file}], dod_coverage: {total, met, unmet_items:[]} }\n\n注意：這不是完整 Code Review（S5 會做）。",
  description: "S4 Mini-Review — Task #{ID}"
)
```

### Verdict 處理

| Verdict | 行動 |
|---------|------|
| `pass` | 正常進入下一任務 |
| `flag` 僅 P2 | 記錄，繼續（P2 = 建議） |
| `flag` 含 P1 | 同一 implementation agent 即時修復 → 重新 verify。最多 1 次重試 |
| 第二次 flag | 標記 `completed_with_flags`，交由 S5 處理 |

### 並行任務處理

同波次並行任務：Mini-Review 在**整批完成後**執行，非逐個。

> **S5 仍然存在**：Mini-Review 不取代 S5 對抗式審查（R1→R2→R3）。

---

## SDD Context 持久化

> 操作手冊見 `.claude/references/sdd-context-persistence.md`（S4 區段，含三個更新時機）

S4 開始時：更新 `current_stage` → `S4`、`stages.s3.status` → `completed`（S4 負責推進 S3，同 S1 推進 S0、S6 推進 S5、S7 推進 S6 的模式）、`stages.s4.status` → `in_progress`、填入 `started_at`
S4 每完成一個任務：追加 `stages.s4.output.completed_tasks`（含 `tdd_evidence`）、更新 `progress`、追加 `changes`
S4 全部完成：`stages.s4.status` → `completed`、填入 `completed_at`、`output.build_status`、`output.tdd_summary`
推進：全部完成 → `current_stage` → S5

---

## S4 Gate

- ✅ 全部任務完成 → 🟢 **自動進入 S5 Code Review**
- 🔄 繼續 → 指定下一個任務編號
- 🐛 問題 → 調度 `debugger` 排查
