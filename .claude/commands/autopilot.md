---
description: "Autopilot 模式 — 自然語言觸發 SOP 全自動執行。S0 人工確認後 S1~S7 自動完成。觸發：「autopilot」、「自動模式」、「全自動」"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, TaskCreate, TaskUpdate, TaskList, mcp__sequential-thinking__sequentialthinking
argument-hint: "<功能描述 | resume | status>"
---

# /autopilot — SDD 智慧自動化模式

> 智慧調度協議見 `.claude/references/conductor-protocol.md`
> Orchestrator 行為規範見 `.claude/references/orchestrator-behavior.md`

## 環境資訊
- 當前分支: !`git branch --show-current 2>/dev/null || echo "(未初始化)"`

## 前置檢查：Git Repository

> SOP 所有階段依賴 Git（分支管理、S7 自動 commit）。啟動前必須確保 git repo 已初始化。

**若上方「當前分支」顯示 `(未初始化)`，必須先執行以下步驟再繼續：**

1. 初始化 Git repo：
   ```bash
   git init -b main && git add . && git commit -m "Initial commit"
   ```
2. 建立 Private GitHub repo（需 `gh` CLI）：
   ```bash
   gh repo create <repo-name> --private --source=. --push
   ```
   - `<repo-name>` 從當前目錄名稱推斷，執行前先用 `AskUserQuestion` 確認名稱
   - 若 `gh` 未安裝或未認證，提示用戶：`brew install gh && gh auth login`
3. 完成後才繼續 Autopilot 流程

## 輸入
指令：$ARGUMENTS

---

## 參數解析

| 參數 | 行為 |
|------|------|
| `<功能描述>` | 啟動 Autopilot S0→S7 |
| `resume` | 掃描進行中的 SOP，從中斷點繼續 |
| `status` | 顯示所有 SOP 的進度 |
| 無參數 | 顯示使用說明 |

---

## 模式 A：啟動新 SOP

### 1. 設定 Autopilot 模式

確認 Orchestrator 進入 Autopilot 模式（後續 Skill 會讀取 `sdd_context.execution_mode`）。

### 2. 觸發 S0

```
Skill(skill: "s0-understand", args: "$ARGUMENTS")
```

S0 `requirement-analyst` 與用戶互動討論需求。

### 3. S0 Gate（🔴 唯一硬門）

S0 完成後，用戶確認 brief_spec：
- ✅ 確認 → S0 output 寫入 sdd_context，**設定 `execution_mode: "autopilot"`**
- ✏️ 調整 → 修改後重新確認

### 4. Auto-Chain S1~S7

用戶確認 S0 後，Orchestrator 自動鏈式推進：

```
依序調用 Skill，每個 Skill 完成後：
1. 讀取更新後的 sdd_context.json
2. 依 Conductor Protocol 狀態機判斷下一步
3. 自動調用下一個 Skill
```

#### 推進序列

```
S1 → Skill(skill: "s1-analyze", args: "{sdd_context JSON}")
  │  💡 S1 完成後建議 /compact
  ▼
S2 → Skill(skill: "s2-spec-review", args: "{sdd_context JSON}")
  │  Quick 模式：S2 自動跳過
  ▼
S3 → Skill(skill: "s3-plan", args: "{sdd_context JSON}")
  │  📋 顯示摘要（波次/任務數），自動繼續
  ▼
S4 → Skill(skill: "s4-implement", args: "{sdd_context JSON}")
  │  💡 S4 完成後建議 /compact
  ▼
S5 → Skill(skill: "s5-review", args: "{sdd_context JSON}")
  │  pass → 繼續 S6
  │  P1 → 自動回 S4（≤3次）
  │  P0 → ⚠️ 中斷通知用戶
  ▼
S6 → Skill(skill: "s6-test", args: "{sdd_context JSON}")
  │  pass → 自動進入 Audit Converge
  │  fail → 自動修復重測（≤3次）
  ▼
AC → Skill(skill: "audit-converge", args: "{spec_folder}")
  │  P0=P1=P2=0 → 繼續 S7
  │  未收斂 → ⚠️ 中斷通知用戶
  ▼
S7 → Skill(skill: "s7-commit", args: "{sdd_context JSON}")
  │  自動 commit（不 push）
  ▼
✅ DONE — 顯示完成通知
```

#### 安全中斷

自動推進過程中，以下情況強制停下：

| 條件 | 行為 |
|------|------|
| S5 P0 | 通知用戶，需人工裁決 |
| S4↔S5 迴圈 3 次 | 通知用戶，建議手動介入 |
| S6 修復迴圈 3 次 | 通知用戶，列出未通過測試 |
| Audit Converge 未收斂 | 通知用戶，列出剩餘 P0/P1/P2 |
| Agent 崩潰 | 嘗試降級，失敗則通知 |
| 用戶說「停」 | 立即暫停 |

---

## 模式 B：恢復進行中的 SOP

```bash
/autopilot resume
```

1. 掃描 `dev/specs/*/sdd_context.json`，找 `status == "in_progress"`
2. 若找到多個 → 列出讓用戶選擇
3. 讀取 sdd_context，從 `current_stage` 繼續 auto-chain
4. 設定 `execution_mode: "autopilot"`（如果之前不是）

---

## 模式 C：查看狀態

```bash
/autopilot status
```

掃描所有 sdd_context.json，顯示：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SOP 狀態總覽

   🟢 進行中:
   - feature-name | S4 實作 | autopilot | 2026-02-27

   ✅ 已完成:
   - old-feature | S7 完成 | 2026-02-26

   ❌ 已取消:
   - cancelled-one | S2 取消 | 2026-02-25
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 使用範例

```bash
# 自然語言啟動
/autopilot 幫我加一個用戶登入功能

# 明確指定 work type
/autopilot 修復 API 回傳 500 錯誤

# 恢復中斷的 SOP
/autopilot resume

# 查看所有 SOP 狀態
/autopilot status
```

---

## 與其他模式的關係

| 模式 | 觸發方式 | Gate 數量 | 適用場景 |
|------|---------|----------|---------|
| **Autopilot** | `/autopilot` 或自然語言 | 1 (S0) | 大部分開發任務 |
| **Semi-Auto** | 「不要 autopilot」 | 4 (S0,S3,S5,S7) | 需要更多控制的任務 |
| **Manual** | 「全手動」 | 8 (全部) | 學習/除錯 SOP |

> 任何時候都可以切換模式。切換後從當前階段繼續。
