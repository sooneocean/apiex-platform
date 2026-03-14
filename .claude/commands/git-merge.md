---
description: "Git 合併評估 - 分析衝突風險，建議合併策略。觸發：「合併」、「merge」、「可以合嗎」"
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "<source-branch>"
disable-model-invocation: true
---

# Git 合併評估

## 環境資訊
- 當前分支: !`git branch --show-current`
- 工作區狀態: !`git status --short | head -5`

## 輸入
來源分支：$ARGUMENTS

---

## 前置檢查

1. 確保工作區乾淨（無未提交的變更）
2. 建議先 `git fetch` 更新遠端
3. 此評估不會實際執行合併

---

## 任務流程

### 1. 前置驗證

```bash
git rev-parse --verify <branch>
git status --porcelain
```

### 2. 測試合併（模擬，自動復原）

```bash
git merge --no-commit --no-ff <branch>
git status
git merge --abort
```

### 3. 風險評估

| 等級 | 條件 |
|------|------|
| 🟢 無衝突 | 無任何衝突檔案 |
| 🟡 低風險 | 僅設定檔衝突 |
| 🟠 中風險 | 有程式碼衝突但數量少 |
| 🔴 高風險 | 大量衝突或核心檔案衝突 |

---

## 合併建議

| 風險 | 建議 |
|------|------|
| 🟢 無衝突 | 可直接 `git merge --no-ff <branch>` |
| 🟡 低風險 | 合併後手動解決少量衝突 |
| 🟠 中風險 | 先查看衝突檔案，評估變更邏輯，或用 `/git-extract` |
| 🔴 高風險 | 不建議直接合併，改用 `/git-extract` 提取有價值內容 |

---

## 安全機制

- **自動復原**：測試合併後自動 `git merge --abort`
- **不自動執行**：`disable-model-invocation: true`，僅用戶可觸發
- **確認機制**：實際合併操作需用戶明確確認
