---
description: "並行開發模式 — 透過 Git Worktree 同時開發多個獨立功能。每個功能在隔離環境中跑 S0→S4，最後統一合併 + S5/S6。觸發：「並行開發」、「parallel」、「同時做」、「worktree」"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, TaskCreate, TaskUpdate, TaskList, TaskGet, Agent, AskUserQuestion, EnterWorktree
argument-hint: "<功能清單（逗號分隔）| 需求描述（自動拆分）>"
---

# /parallel-develop — ChillVibe 並行開發

> 透過 Git Worktree 讓多個功能在隔離分支上同時開發，最後統一合併審查。

## 環境資訊
- 當前分支: !`git branch --show-current 2>/dev/null || echo "(未初始化)"`
- 工作目錄: !`pwd`
- Git 狀態: !`git status --porcelain | head -5`
- 現有 worktree: !`git worktree list 2>/dev/null || echo "(無)"`

## 輸入
指令：$ARGUMENTS

---

## 前置條件

1. **Git 已初始化**（若無 → 提示用戶初始化）
2. **工作區乾淨**（若有未提交變更 → 提示先 commit 或 stash）
3. **當前不在 worktree 內**（若已在 worktree → 提示先回主目錄）

---

## Phase 0：需求分析與拆分

### 參數解析

| 輸入格式 | 行為 |
|---------|------|
| `功能A, 功能B, 功能C` | 明確功能清單，直接進入 Phase 1 |
| `<一段需求描述>` | 自動分析拆分為獨立功能 |
| `status` | 顯示進行中的並行開發狀態 |
| `merge` | 合併已完成的並行分支 |

### 自動拆分（若為需求描述）

調用 `architect` Agent 分析需求，拆分成可並行的獨立功能：

```
Agent(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "分析以下需求，拆分為可獨立開發的功能模組。每個模組必須：
    1. 不依賴其他模組的新程式碼（可依賴現有 codebase）
    2. 可獨立測試
    3. 明確的 scope 邊界

    需求：{$ARGUMENTS}

    輸出 JSON：
    {
      features: [
        { name: string, branch_name: string, description: string, scope: string[], estimated_complexity: 'low'|'medium'|'high' }
      ],
      dependencies: [ { from: string, to: string, type: 'hard'|'soft' } ],
      parallel_groups: [ [feature_names...] ]  // 可同時進行的分組
    }

    注意：branch_name 格式為 feature/<kebab-case>",
  description: "Phase 0 需求拆分"
)
```

### 用戶確認

顯示拆分結果，讓用戶確認或調整：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔀 ChillVibe 並行開發 — 功能拆分

   並行組 1（同時執行）：
   ├─ feature/user-auth        中等  ← 用戶認證模組
   └─ feature/dashboard-ui     低    ← 儀表板 UI

   並行組 2（組 1 完成後）：
   └─ feature/role-permission  高    ← 權限管理（依賴 user-auth）

   總計：3 功能 | 2 波次
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

🔴 **Gate：用戶確認拆分方案後才繼續**

---

## Phase 1：建立 Worktree + Feature Branch

確認後，為每個功能建立隔離的 worktree：

```bash
# 為每個功能建立 worktree
git worktree add .claude/worktrees/<branch-name> -b <branch-name>
```

### Worktree 結構

```
project-root/
├── .claude/worktrees/
│   ├── feature-user-auth/        ← worktree 1
│   ├── feature-dashboard-ui/     ← worktree 2
│   └── feature-role-permission/  ← worktree 3（Phase 2 才建立）
└── (主工作區 — 不動)
```

### 建立追蹤檔

在主工作區建立 `dev/parallel-sessions.json`：

```json
{
  "session_id": "parallel-{timestamp}",
  "created_at": "ISO-8601",
  "base_branch": "main",
  "status": "in_progress",
  "features": [
    {
      "name": "user-auth",
      "branch": "feature/user-auth",
      "worktree_path": ".claude/worktrees/feature-user-auth",
      "wave": 1,
      "status": "pending",
      "sdd_context_path": null
    }
  ],
  "waves": [
    { "wave": 1, "features": ["user-auth", "dashboard-ui"], "status": "pending" },
    { "wave": 2, "features": ["role-permission"], "status": "blocked" }
  ]
}
```

---

## Phase 2：並行 SOP 執行

### 同波次功能 — 並行 Agent 調度

同波次的功能使用 `Agent` tool 並行調度，每個 Agent 在其 worktree 內獨立執行 S0→S4：

```
# 並行調度（同波次的功能同時啟動）
Agent(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "你在一個 Git Worktree 隔離環境中工作。
    工作目錄：{worktree_path}
    功能：{feature.name}
    描述：{feature.description}
    Scope：{feature.scope}

    執行以下 SDD 階段（精簡版，不需要 Codex 審查）：

    1. S1 技術分析：掃描 codebase（在 worktree 內），識別影響範圍
    2. S3 執行計畫：產出任務清單（寫入 worktree 內的 dev/specs/）
    3. S4 實作：依計畫實作功能碼 + 測試
    4. 建置驗證：確保 build 通過
    5. Git commit：在 feature branch 上 commit 所有變更

    完成後輸出 JSON：
    {
      feature: string,
      branch: string,
      status: 'completed' | 'failed',
      commits: [hash...],
      files_changed: number,
      build_status: 'pass' | 'fail',
      summary: string,
      issues: [string...]
    }",
  description: "Parallel S1→S4: {feature.name}",
  isolation: "worktree"
)
```

### 波次控制

```
Wave 1：所有無依賴的功能 → 並行 Agent
  ↓ 等待全部完成
Wave 2：依賴 Wave 1 的功能 → 並行 Agent
  ↓ 等待全部完成
...
```

### 進度監控

每個 Agent 完成後更新 `parallel-sessions.json`：

```json
{
  "name": "user-auth",
  "status": "completed",
  "completed_at": "ISO-8601",
  "commits": ["abc1234"],
  "files_changed": 12,
  "build_status": "pass"
}
```

---

## Phase 3：合併

所有波次完成後，進入合併階段：

### 3.1 合併策略

```bash
# 回到主分支
git checkout main

# 依波次順序合併（先獨立的，後依賴的）
for branch in wave_order:
    git merge --no-ff feature/<branch-name> -m "merge: parallel-develop — <feature-name>"

    # 若有衝突
    if conflict:
        # 通知用戶，顯示衝突檔案
        # 嘗試自動解決（若為不同檔案的變更）
        # 若無法自動解決 → 中斷，請用戶手動處理
```

### 3.2 衝突處理

| 衝突類型 | 處理方式 |
|---------|---------|
| 不同檔案 | 自動合併（無衝突） |
| 同檔案不同區段 | Git 自動合併 |
| 同檔案同區段 | 🔴 通知用戶，協助手動解決 |

---

## Phase 4：統一審查 + 測試

合併完成後，在主分支上執行 S5 + S6：

### 4.1 統一 Code Review（S5）

```
Skill(skill: "s5-review", args: "{合併後的 sdd_context}")
```

審查範圍：所有並行分支的合併差異（vs 原始 main）。

### 4.2 統一測試（S6）

```
Skill(skill: "s6-test", args: "{合併後的 sdd_context}")
```

### 4.3 提交（S7）

```
Skill(skill: "s7-commit", args: "{合併後的 sdd_context}")
```

---

## Phase 5：清理

```bash
# 移除所有 worktree
for wt in worktrees:
    git worktree remove .claude/worktrees/<branch-name>

# 刪除本地 feature branch（可選）
for branch in branches:
    git branch -d feature/<branch-name>
```

---

## /parallel-develop status

顯示進行中的並行開發狀態：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔀 ChillVibe 並行開發狀態

Session: parallel-1709312400
Base: main

   Wave 1 [進行中]
   ├─ ✅ feature/user-auth        12 files  +340 -20
   └─ 🔄 feature/dashboard-ui     進行中...

   Wave 2 [等待中]
   └─ ⏳ feature/role-permission  等待 Wave 1

   進度：1/3 功能完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## /parallel-develop merge

手動觸發合併（若自動流程被中斷）：

1. 讀取 `parallel-sessions.json`
2. 確認所有功能已完成
3. 執行 Phase 3 + Phase 4

---

## 安全閥

| 條件 | 行為 |
|------|------|
| Agent 失敗 | 標記該功能 `failed`，繼續其他功能，完成後通知 |
| 合併衝突無法自動解決 | 中斷，通知用戶手動處理 |
| 建置失敗 | 阻斷合併，通知用戶 |
| Worktree 磁碟空間不足 | 提前檢查，不足則減少並行數量 |

---

## 使用範例

```bash
# 明確功能清單
/parallel-develop 用戶認證, 儀表板 UI, 權限管理

# 自然語言（自動拆分）
/parallel-develop 做一個完整的用戶管理系統，包含登入、個人頁面、權限設定

# 查看狀態
/parallel-develop status

# 手動合併
/parallel-develop merge
```
