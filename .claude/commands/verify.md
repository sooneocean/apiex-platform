---
description: "獨立驗證探索 - 探索 codebase、查詢資料庫、核對文件，純讀取不修改。觸發：「驗證」、「確認一下」、「分析一下」、「搞清楚」、「核對」、「verify」。不用於錯誤診斷（用 /debug）或需求開發（用 SOP）。"
allowed-tools: Read, Grep, Glob, Bash, Task, mcp__sequential-thinking__sequentialthinking, mcp__genaiToolbox__execute_sql, mcp__genaiToolbox__show_table_structure, mcp__genaiToolbox__list_tables, mcp__genaiToolbox__show_users
argument-hint: "<問題 | 檔案路徑 | 表名+查詢>"
---

# /verify — 獨立驗證探索

> **純讀取**：本 Skill 不修改任何檔案、不寫 sdd_context、不觸發 SOP 管線。

## 環境資訊
- 當前分支: !`git branch --show-current`
- 最近變更: !`git log --oneline -5 2>/dev/null || echo "(no commits)"`

## 輸入
驗證目標：$ARGUMENTS

---

## 輸入模式判斷

根據 $ARGUMENTS 自動分類：

### Mode A：代碼/架構問題
**判斷**：涉及 class、method、模組、邏輯、架構、流程、「怎麼運作」、「是什麼」
**範例**：`GoBack 的三層分流邏輯是什麼？`、`AuthInterceptor 如何處理 401？`

### Mode B：文件/Spec 核對
**判斷**：$ARGUMENTS 包含檔案路徑（.md/.dart/.cs）或提及「spec」「文件」「核對」
**範例**：`dev/specs/.../s1_dev_spec.md`、`這份 spec 的 API 設計跟實際 code 一致嗎？`

### Mode C：資料庫資料分析
**判斷**：提及 table 名稱、「表」「資料庫」「DB」「SQL」「分佈」「統計」
**範例**：`MatchRatings 表的 IsDeleted 分佈`、`最近 7 天有多少新用戶？`

### Mode D：混合/多面向驗證
**判斷**：同時涉及程式碼 + 資料庫，或需要跨層驗證
**範例**：`GoBackService 的扣款邏輯跟 DB 的 GoBackHistories 資料是否吻合？`

> 若無法判斷模式，直接詢問用戶需要驗證什麼。

---

## Agent 調度

### 直接處理（預設）

大部分驗證任務由 Skill 層直接使用 sequential-thinking + Read/Grep/Glob 處理，不需要調度 Agent。

### 調度 sql-expert（Mode C / Mode D 涉及 DB 時）

> **前置條件**：需安裝 database stack（manifest 含 `sql-expert` agent 且 `genaiToolbox` MCP 已註冊）。未安裝時 Orchestrator 直接使用可用的 DB 工具或提示用戶手動查詢。

```
Task(
  subagent_type: "sql-expert",
  model: "sonnet",
  prompt: "以純查詢模式分析以下資料庫問題（禁止任何寫入操作）：\n\n{DB 查詢描述}\n\n規則：\n1. 先用 show_table_structure 確認欄位名稱，禁止用猜的\n2. 僅執行 SELECT / DESCRIBE / SHOW 類查詢\n3. 產出結構化分析結果（含 SQL + 結果 + 解讀）\n4. 無 sdd_context_path — 跳過持久化",
  description: "Verify 資料庫查詢"
)
```

### 選擇性調度 codebase-explorer（Mode A 深度分析時）

**觸發條件**：問題涉及 3+ 個模組的交互、耦合度評估、大範圍影響分析。

```
Task(
  subagent_type: "codebase-explorer",
  model: "sonnet",
  prompt: "以純探索模式分析以下問題（不產出 dev_spec，不寫 sdd_context）：\n\n{分析問題}\n\n請產出：影響範圍、依賴關係、風險評估。\n\n注意：無 sdd_context_path — 跳過持久化。純讀取探索。",
  description: "Verify 代碼深度探索"
)
```

---

## 驗證流程

### Mode A：代碼/架構問題

1. **解析問題**：用 sequential-thinking 拆解為可驗證的子問題
2. **定位代碼**：Grep 搜尋關鍵 class/method/endpoint
3. **追蹤調用鏈**：向上（誰調用）、向下（調用誰）
4. **交叉驗證**：前端 ↔ 後端 ↔ 資料庫一致性
5. **回答問題**：附帶程式碼片段與檔案路徑作為證據

### Mode B：文件/Spec 核對

1. **讀取文件**：Read 目標文件完整內容
2. **提取可驗證聲明**：用 sequential-thinking 列出所有可驗證的技術聲明（API endpoint、Class/Method 名稱與簽名、資料模型欄位、邏輯流程、依賴關係）
3. **逐項核對**：每個聲明用 Grep/Read 找到對應原始碼，標記 ✅ 正確 / ❌ 不正確 / ⚠️ 部分正確 / ❓ 無法驗證
4. **彙總結果**：正確率 + 問題清單

### Mode C：資料庫資料分析

1. **表結構確認**：**必須**先呼叫 show_table_structure 確認欄位名稱
2. **調度 sql-expert**：撰寫並執行查詢
3. **結果解讀**：數據含義 + 異常值標記 + 業務邏輯對照

### Mode D：混合驗證

1. 分離代碼面與資料面的驗證子任務
2. 代碼面：按 Mode A 流程
3. 資料面：按 Mode C 流程（調度 sql-expert）
4. 交叉驗證：程式碼邏輯 vs 實際資料，找出不一致

---

## 輸出格式

### 通用驗證報告

```
## 驗證報告

### 驗證目標
{原始問題或文件名}

### 模式
{Mode A/B/C/D} — {一句話描述}

### 發現

#### 1. {發現標題}
**結論**：{✅ 正確 / ❌ 不正確 / ⚠️ 部分正確}
**證據**：
- `{檔案路徑}:{行號}` — {相關程式碼片段}
- {SQL 查詢結果}（如適用）
**說明**：{解釋}

### 總結
{整體結論 — 直接回答原始問題}

### 證據索引
| # | 檔案 | 行號 | 用途 |
|---|------|------|------|
| 1 | `{path}` | {line} | {what it proves} |

### ⚠️ 未能驗證項目（如有）
- {無法確認的事項 + 原因}
```

### Mode B 專用：Spec 核對表

```
### Spec 核對結果

| # | Spec 聲明 | 狀態 | 實際情況 | 證據 |
|---|----------|------|---------|------|
| 1 | {聲明內容} | ✅ | {一致} | `file:line` |
| 2 | {聲明內容} | ❌ | {差異描述} | `file:line` |

**準確率**：{correct}/{total} ({percentage}%)
```

---

## 安全規則

- **純讀取**：不修改檔案、不寫 sdd_context、不建立新檔案
- **DB 安全**：僅 SELECT/DESCRIBE/SHOW，禁止 INSERT/UPDATE/DELETE
- **欄位確認**：DB 查詢前必須 show_table_structure，參考 `.claude/references/db-schema-cheatsheet.md`
- **誠實原則**：無法驗證的項目標記 ❓，不猜測、不編造

---

## 與其他指令的關係

| 需求 | 使用 |
|------|------|
| 「搞清楚 X 怎麼運作」 | `/verify`（本指令） |
| 「X 壞了 / 報錯了」 | `/debug` |
| 「審查這段 code」 | `/code-review` |
| 「審查這份 spec」 | `/spec-review` |
| 「我想做一個新功能」 | SOP S0（`/s0-understand`） |

---

## 使用範例

```
# Mode A：代碼問題
/verify GoBack 的三層分流邏輯是什麼？
/verify AuthInterceptor 如何處理 token refresh？

# Mode B：文件核對
/verify dev/specs/2026-02-17_1_goback-complete-refactor/s1_dev_spec.md
/verify 這份 spec 的 API 設計跟實際 code 一致嗎？

# Mode C：資料庫分析
/verify MatchRatings 表的 IsDeleted 分佈
/verify 最近 30 天的 GoBack 使用次數統計

# Mode D：混合驗證
/verify GoBackService 的扣款邏輯跟 GoBackHistories 資料是否吻合？
```
