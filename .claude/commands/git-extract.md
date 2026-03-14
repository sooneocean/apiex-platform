---
description: "Git 內容提取 - 從分支提取有價值的變更，生成 Spec 進入 S0~S7。觸發：「提取」、「extract」、「拿過來」"
allowed-tools: Bash, Read, Grep, Glob, Write
argument-hint: "<source-branch> <file-pattern | feature-name>"
---

# Git 內容提取

## 環境資訊
- 當前分支: !`git branch --show-current`
- 可用分支: !`git branch -a | grep -v HEAD | head -15`

## 輸入
提取參數：$ARGUMENTS

格式：
- `<branch>` — 提取整個分支的變更
- `<branch> <pattern>` — 提取符合 pattern 的檔案
- `<branch> <feature-name>` — 提取特定功能相關檔案

---

## 任務流程

### 1. 分析來源分支

```bash
git diff --name-status main..<branch>
git diff --stat main..<branch>
```

### 2. 識別可提取內容

- **功能模組**：同一 feature 目錄下的檔案群組（BLoC/Service/Repository）
- **依賴分析**：共用元件、API 端點、DB Schema 變更
- **分類**：必要檔案（功能核心）→ 相關檔案（輔助）→ 可選檔案（測試、文件）

### 3. 生成提取清單

按 Frontend / Backend / Database 分類列出，標註 ✅ 必要 / ⚪ 可選。

### 4. 自動生成 Spec

根據提取內容生成：需求描述、實作參考（來源分支）、技術要點、驗收標準。

### 5. 確認並觸發 S0

| 選項 | 說明 |
|------|------|
| ✅ 確認 | 以 Spec 觸發 `/s0-understand`，開始 S0~S7 |
| ✏️ 修改 | 調整 Spec 後再確認 |
| 📋 僅保存 | 保存但不立即執行 |
| ❌ 取消 | 不進行提取 |

---

## 注意事項

- 不直接複製程式碼，僅作為參考
- 需遵守現有架構規範
- 需通過 S5 審查與 S6 測試
