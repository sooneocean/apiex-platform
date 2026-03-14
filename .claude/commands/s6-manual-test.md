---
description: "S6 手動測試引導 - 互動式逐案引導手動 TC 測試，支援斷點續測與 compact 恢復。觸發：「手動測試」、「manual test」、「繼續測試」"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, mcp__genaiToolbox__execute_sql, mcp__genaiToolbox__show_table_structure, mcp__genaiToolbox__list_tables
argument-hint: "[init | status | defects | done | TC-X-Y | serve]"
---

# S6 手動測試引導（互動式逐案）

> 本 Skill 提供手動 TC 的逐案互動測試流程，支援斷點續測與 compact 恢復。
> 自動化測試（Unit/E2E/Integration）使用 `/s6-test` Skill。

## 環境資訊
- 當前分支: !`git branch --show-current`

## 輸入
$ARGUMENTS

---

## Mode Router

根據 `$ARGUMENTS` 判斷執行模式：

| 輸入 | Mode | 行為 |
|------|------|------|
| 空 / 「繼續」 | **RESUME** | 讀 session JSON → 進度摘要 → 呈現下一個 TC |
| `init` | **INIT** | 掃描 checklist → 建立 session JSON → 呈現第一個 TC |
| `status` | **STATUS** | 只顯示進度儀表板 |
| `defects` | **DEFECTS** | 顯示缺陷清單 |
| `done` | **FINALIZE** | 結算 → 更新 checklist 總結表 + SDD Context |
| `TC-X-Y` | **JUMP** | 跳到指定 TC（有依賴未完成時顯示警告但不阻擋） |
| `serve` | **SERVE** | 啟動 demo 環境 → 確認後進入 RESUME |

> RESUME 找不到 session JSON 但找到 checklist → 自動 fallback 到 INIT。

---

## SERVE Mode

> 薄層整合：引導啟動 demo 環境，確認後銜接手動測試。

### Step 1：檢查 demo 環境狀態

讀取 `.claude/tunnel.pid.json`。

- **存在且 process alive** → 顯示現有 URL，詢問「demo 環境已在運行（<url>），要直接開始測試嗎？」
  - 是 → 跳到 Step 3
  - 否 → 提示用 `/demo restart`
- **不存在或 process dead** → 繼續 Step 2

### Step 2：引導啟動

輸出：
```
請執行 /demo 啟動測試環境。
啟動完成後回來告訴我，我會繼續引導手動測試。
```

等待用戶確認。

### Step 3：銜接測試

自動 fallback 到 **RESUME** mode 的邏輯（讀 session JSON → 進度摘要 → 呈現下一個 TC）。

---

## Step 1：定位 Spec 目錄

1. 讀取 SDD Context（從啟動 hook 注入的 `spec_folder` 或從 `dev/specs/` 下找最新的 `sdd_context.json`）
2. 取得 `spec_folder` 路徑
3. 組合路徑：
   - **checklist**: `{spec_folder}/s6_test_checklist.md`
   - **session**: `{spec_folder}/s6_manual_test_session.json`
   - **sdd_context**: `{spec_folder}/sdd_context.json`

---

## Step 2：Mode 分支執行

### INIT Mode

1. 讀取 `{spec_folder}/s6_test_checklist.md`
2. 用 regex 解析：
   - 群組：`## TC-N：` 開頭的行
   - TC：`### TC-N-M：` 開頭的行
   - 依賴：含 `接續 TC-X-Y` 的前置條件
3. **排除** `TC-IT` 群組（自動化 Integration Test，非手動）
4. 建立 session JSON（schema 見下方），寫入 `{spec_folder}/s6_manual_test_session.json`
5. 顯示初始儀表板 + 呈現第一個 TC

**Session JSON Schema (v1.0)**：

```json
{
  "version": "1.0",
  "feature": "<from sdd_context>",
  "spec_folder": "<path>",
  "checklist_path": "s6_test_checklist.md",
  "started_at": "<ISO>",
  "last_updated": "<ISO>",
  "current_group": "TC-1",
  "next_tc": "TC-1-1",
  "progress": {
    "total": 0, "passed": 0, "failed": 0,
    "blocked": 0, "skipped": 0, "pending": 0
  },
  "groups": {
    "TC-1": { "name": "群組名", "total": 5, "tcs": ["TC-1-1", "TC-1-2", ...] }
  },
  "results": {
    "TC-1-1": {
      "status": "pending",
      "title": "TC 標題",
      "group": "TC-1",
      "depends_on": [],
      "notes": "",
      "tested_at": "",
      "defect_ids": []
    }
  },
  "defects": [],
  "repair_loops": []
}
```

> `progress` 是快取，每次讀取時從 `results` 重算以防漂移。

### RESUME Mode

1. 嘗試讀取 `{spec_folder}/s6_manual_test_session.json`
2. 找不到 → 檢查 checklist 是否存在 → 存在就 fallback 到 INIT
3. 找到 → 從 `results` 重算 `progress`（防漂移）
4. 顯示進度儀表板
5. 從 `next_tc` 讀取 checklist 對應 TC 詳情，呈現給用戶

### STATUS Mode

1. 讀取 session JSON
2. 重算 progress
3. 顯示儀表板（不呈現 TC 詳情）

### DEFECTS Mode

1. 讀取 session JSON
2. 列出 `defects` 陣列，按嚴重度排序

### JUMP Mode（`TC-X-Y`）

1. 讀取 session JSON
2. 確認 `TC-X-Y` 存在於 `results`
3. 檢查依賴（`depends_on`）— 有依賴未完成時 **顯示警告但不阻擋**
4. 更新 `next_tc` → `TC-X-Y`
5. 呈現該 TC

### FINALIZE Mode（`done`）

1. 讀取 session JSON
2. 檢查是否全部測完（有 pending → 列出並詢問是否跳過）
3. 檢查是否有 open P0/P1（有 → 必須修復才能 proceed）
4. 更新 checklist.md「測試總結」表格數字
5. 更新 sdd_context.json `stages.s6.output.manual_tests` 新增摘要：
   ```json
   {
     "total": 29,
     "passed": N,
     "failed": N,
     "blocked": N,
     "skipped": N,
     "defects": []
   }
   ```
6. Gate 判斷：
   - 全 pass → 可進 S7
   - 有 P0/P1 → 必須修復才能 proceed

---

## Step 3：TC 呈現格式（一次一案）

每次只呈現 **1 個 TC**，格式如下：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TC-N-M：{標題}
 群組：TC-N {群組名} | 群組進度：{done}/{group_total}
 整體：{done}/{total}（pass:{pass} fail:{fail} blocked:{blocked} skipped:{skipped}）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

依賴：TC-X-Y（{status}）     ← 有依賴時才顯示

【前置條件】
• ...

【測試步驟】
1. ...

【預期結果】
□ ...

【DB 驗證 SQL】                   ← 有 DB 項時才顯示
（提供可執行的 SQL + 問「要我執行嗎？」）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
回報結果：pass | fail P{0-3}: {描述} | blocked | skipped
下一個：TC-N-M+1（{title}）
```

TC 詳情從 checklist.md 中對應的 `### TC-N-M：` 段落提取：
- 前置條件：`- **前置**：` 到 `- **步驟**：` 之間
- 測試步驟：`- **步驟**：` 下的編號列表
- 預期結果：`- **預期**：` 下的 checkbox 列表
- DB 驗證：預期結果中含 `DB:` 前綴的項目 → 自動生成對應 SQL

---

## Step 4：RECORD 流程（用戶回報結果後）

用戶回報格式：`pass` / `fail P{0-3}: {描述}` / `blocked` / `skipped`

### 4.1 更新 session JSON

- `results[tc_id].status` = pass/fail/blocked/skipped
- `results[tc_id].notes` = 用戶描述（fail 時的問題描述）
- `results[tc_id].tested_at` = ISO timestamp
- 重算 `progress` 計數
- 推進 `next_tc` 到下一個 pending TC

### 4.2 更新 checklist.md

- **pass** → 該 TC 下所有 `- [ ]` 改為 `- [x]`
- **fail** → checkbox 不動，在該群組「問題記錄」表新增一行
- **blocked/skipped** → checkbox 不動

### 4.3 Defect 處理（fail 時）

- 分配 ID: `MT-{NNN}`（從 001 開始，遞增）
- 寫入 session JSON `defects` 陣列：
  ```json
  {
    "id": "MT-001",
    "tc_id": "TC-X-Y",
    "severity": "P1",
    "description": "用戶回報的描述",
    "status": "open",
    "found_at": "<ISO>"
  }
  ```
- 寫入 checklist.md 對應群組的「問題記錄」表
- **P0/P1** → 顯示警告：建議暫停手動測試，優先進入修復流程

### 4.4 呈現下一個 TC

自動呈現下一個 pending TC（按 TC 編號順序）。

---

## 進度儀表板格式

```
╔══════════════════════════════════════════╗
║  S6 手動測試進度 — {feature}
╠══════════════════════════════════════════╣
║  整體：{done}/{total}
║  pass:{pass}  fail:{fail}  blocked:{blocked}  skipped:{skipped}  pending:{pending}
╠══════════════════════════════════════════╣
║  TC-1 正常 GoBack 流程      {done}/{total} {status_bar}
║  TC-2 Pre-check 攔截        {done}/{total} {status_bar}
║  TC-3 錯誤處理              {done}/{total} {status_bar}
║  TC-4 狀態與生命週期        {done}/{total} {status_bar}
║  TC-5 三層分流購買流程      {done}/{total} {status_bar}
║  TC-6 回歸測試              {done}/{total} {status_bar}
╠══════════════════════════════════════════╣
║  Open Defects: {count}（P0:{p0} P1:{p1} P2:{p2} P3:{p3}）
║  下一個：TC-N-M {title}
╚══════════════════════════════════════════╝
```

---

## Compact 恢復鏈

```
startup hook → 注入 SDD Context（知道在 S6）
     ↓
用戶：/s6-manual-test（或「繼續測試」）
     ↓
Skill RESUME → 讀 session JSON（知道下一個 TC）
     ↓
讀 checklist.md → 取 TC 詳情 → 呈現給用戶
     ↓
繼續測試
```

---

## 注意事項

- 本 Skill 是互動式協調器，**不調度 Agent**（Task tool）
- DB 驗證項直接提供 SQL 並使用 `genaiToolbox` 工具執行
- Session JSON 不寫進 SDD Context 本體，只在 FINALIZE 時寫摘要
- 手動測試天生慢，一次只呈現 1 個 TC 降低認知負擔
