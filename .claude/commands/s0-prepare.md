---
description: "S0 前置準備 - 互動式引導填寫 s0_requirement_input.md。在 SOP 外完成需求整理，完成後用 Mode A 快速進入 S0。觸發：「準備需求」、「填需求」、「prepare」、「/s0-prepare」"
allowed-tools: Read, Grep, Glob, Write, Edit, Task, AskUserQuestion, mcp__sequential-thinking__sequentialthinking
argument-hint: "<功能名稱 或 既有 spec_folder 路徑>"
---

# S0 前置準備：互動式需求輸入

## 環境資訊
- 當前分支: !`git branch --show-current 2>/dev/null || echo "(未初始化)"`
- 既有 spec 資料夾: !`ls -d dev/specs/*/sdd_context.json 2>/dev/null | head -5`

## 前置檢查：Git Repository

> SOP 所有階段依賴 Git（分支管理、S7 自動 commit）。開始前必須確保 git repo 已初始化。

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
3. 完成後才繼續流程

## 輸入
功能描述：$ARGUMENTS

---

## 目的

本 Skill 引導用戶在 **SOP 外** 互動式完成 `s0_requirement_input.md`（需求百科）。
完成後直接餵進 `/s0-understand <path>` 走 Mode A 快速路線，跳過 S0 互動討論。

**定位**：SOP 前置工具，不觸發 SOP 管線、不建立 SDD Context。

---

## 流程

### Step 1：確定 spec 資料夾

1. 若 `$ARGUMENTS` 是既有 `dev/specs/` 路徑 → 使用該資料夾
2. 若 `$ARGUMENTS` 是功能描述 → 建立新資料夾：`dev/specs/{YYYY-MM-DD}_{N}_{feature-name}/`
   - N = 當日序號（掃描同日資料夾，取最大 +1）
   - feature-name = kebab-case（從描述提取）
3. 用 `AskUserQuestion` 確認資料夾名稱

### Step 2：逐段引導填寫

讀取模板 `dev/specs/_templates/s0_requirement_input_template.md`，**逐段**引導用戶：

**引導原則**：
- 每次只問 **1~2 個 section**，不要一口氣問完
- 必填（`*`）的 section 必須有實質內容才能往下
- 選填 section 問用戶「要填嗎？」，回答「跳過」就留空
- 用戶給自然語言，你幫他結構化整理成模板格式
- 每段完成後簡短覆述確認，用戶說 OK 才往下

**Section 順序與策略**：

| 順序 | Section | 策略 |
|------|---------|------|
| 1 | §0 工作類型 | 用 `AskUserQuestion` 給 5 選項（新需求/重構/Bug/補完/調查） |
| 2 | §1 一句話描述 | 請用戶用一句話說，你幫精煉 |
| 3 | §2 為什麼要做 | 追問痛點，用 sequential-thinking 拆解 |
| 4 | §3 使用者是誰 | 引導列出角色 + 參與方式表格 |
| 5 | §4 核心流程 | **最複雜段**：先請口述 happy path → 你產生 Mermaid → 確認 → 再問異常情境 |
| 6 | §5 成功標準 | 基於前面討論，提出建議標準讓用戶挑選/調整 |
| 7 | §6 不做什麼 | 基於範圍推斷，主動列出建議排除項 |
| 8 | §7~§9 | 視 work_type 決定：涉及金流填 §7（業務邏輯）、涉及多角色通知填 §8、涉及外部服務填 §9 |
| 9 | §10 Baseline | **補完/重構** work_type → 必填。引導用「已完成/已知問題/參考文件」結構化 |
| 10 | §11~§13 | 快速過一遍：限制？優先級？補充？ |

### Step 3：組裝與寫入

1. 將所有 section 組裝成完整的 `s0_requirement_input.md`
2. 寫入 `{spec_folder}/s0_requirement_input.md`
3. 統計完成度：必填 section 數、選填已填數、總行數

### Step 4：下一步提示

```
✅ 需求輸入文件已完成！

📄 檔案：{spec_folder}/s0_requirement_input.md
📊 完成度：必填 {N}/5 ✅ | 選填 {M}/{total} | 共 {lines} 行

🚀 下一步：
   /s0-understand {spec_folder}/s0_requirement_input.md
   （將走 Mode A 快速路線，跳過互動討論，直接確認+補充後產出 brief_spec）
```

---

## 特殊處理

### §4 核心流程（最複雜的 section）

1. 先問用戶口述整體流程（自然語言）
2. 用 `sequential-thinking` 分析流程，拆解為階段
3. 產生 Mermaid flowchart（標注 🤖/👤/🔄/🌐）
4. 呈現給用戶確認，修正到滿意
5. 再問異常/邊界情境，整理成表格

### §10 Baseline（補完/重構類）

如果 work_type 是補完或重構：
1. 可選擇性用 `Grep`/`Glob` 掃描 codebase 輔助盤點已有實作
2. 引導用戶列出已知問題（給 ID + 嚴重度 + 描述格式）
3. 引用既有的分析文件路徑

### 中斷恢復

如果用戶中途離開：
- 已寫入的 section 保存在 `{spec_folder}/s0_requirement_input.md`（partial）
- 用戶可再次執行 `/s0-prepare {spec_folder}` 繼續填寫
- Skill 讀取既有檔案，判斷哪些 section 已填、哪些待填

---

## 限制

- 本 Skill **不啟動 SOP**、不建立 `sdd_context.json`
- 不修改程式碼，僅產出 spec 文件
- 不做技術分析（那是 S1 的事）
