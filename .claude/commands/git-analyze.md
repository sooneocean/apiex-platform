---
description: "Git 分支分析 - 查看其他分支的 commit、diff、變更內容。觸發：「分析分支」、「看一下 xxx 分支」"
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "<branch-name | commit-range>"
---

# Git 分支分析

## 環境資訊
- 當前分支: !`git branch --show-current`
- 可用分支: !`git branch -a | head -20`

## 輸入
分析目標：$ARGUMENTS

支援格式：`feature/xxx`（分支）、`main..feature/xxx`（範圍）、`abc1234`（單一 commit）

---

## 任務流程

### 1. 取得分支基本資訊

```bash
git rev-list --count main..<branch>
git log --oneline main..<branch>
git log -1 --format="%ai %an" <branch>
```

### 2. 分析變更檔案

```bash
git diff --name-status main..<branch>
git diff --stat main..<branch>
```

### 3. 分類整理

| 類別 | 路徑 |
|------|------|
| Frontend | `app/` |
| Backend | `server/` |
| Database | Migration、Schema |
| Config | 設定檔 |
| Docs | 文件 |

### 4. 與當前分支比較

```bash
# 領先/落後統計
git rev-list --left-right --count main...<branch>

# 共同修改的檔案（衝突風險）
comm -12 <(git diff --name-only main | sort) <(git diff --name-only main..<branch> | sort)
```

---

## 輸出

產出分支分析報告：基本資訊、Commit 歷史、變更統計（按類別）、關鍵變更摘要、衝突風險評估（🟢🟡🔴）。

### 建議操作

| 風險 | 建議 |
|------|------|
| 🟢 無衝突 | `/git-merge` 合併評估 |
| 🟡 中風險 | 先查看共同修改檔案 |
| 🔴 高風險 | `/git-extract` 提取有價值內容 |
