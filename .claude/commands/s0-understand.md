---
description: "S0 需求討論 - 互動式理解需求並產出需求共識。觸發：「開始SOP:」、「我想要」、「幫我做」、「新增功能」、新需求描述。不用於簡單問答或查詢。"
allowed-tools: Read, Grep, Glob, Task, mcp__sequential-thinking__sequentialthinking
argument-hint: "<需求描述 或 需求模板檔案路徑>"
---

# S0 需求討論（互動式）

## 環境資訊
- 當前分支: !`git branch --show-current 2>/dev/null || echo "(未初始化)"`
- 專案狀態: !`git status --porcelain 2>/dev/null | head -10`

## 前置檢查：Git Repository

> SOP 所有階段依賴 Git（分支管理、S7 自動 commit）。S0 啟動前必須確保 git repo 已初始化。

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
3. 完成後才繼續 S0 流程

## 輸入
需求描述：$ARGUMENTS

---

## 輸入模式判斷

S0 支援兩種輸入模式，根據 `$ARGUMENTS` 內容自動判斷：

### 模式 A：結構化輸入（模板）
**判斷條件**：`$ARGUMENTS` 包含模板標記（如 `## 1. 一句話描述`、`## 核心流程`），或指向一個 `.md` 檔案路徑。

**流程**：
1. 讀取並解析結構化輸入（模板格式見 `dev/specs/_templates/s0_requirement_input_template.md`）
2. 直接進入「確認+補充」模式 — 跳過探索式提問
3. 列出已理解的內容 + 標記「待討論」的空白欄位
4. 只針對缺漏/模糊處提出 2-3 個精準問題
5. 確認後產出需求共識

### 模式 B：自然語言輸入（現有流程）
**判斷條件**：`$ARGUMENTS` 是一般自然語言描述。

**流程**：
1. 初步理解 → 主動提出確認問題
2. 互動討論直到共識
3. 產出需求共識

> **提示**：若用戶輸入較模糊，主動提供模板路徑：
> 「你可以用 `dev/specs/_templates/s0_requirement_input_template.md` 模板填寫需求，會更快收斂。」

---

## Agent 調度

**本階段調度**：`requirement-analyst`

```
Task(
  subagent_type: "requirement-analyst",
  model: "sonnet",
  prompt: "分析以下需求輸入並與用戶互動確認：\n\n{需求描述}\n\n1. 先判斷工作類型（work_type）：模板勾選 > 信號詞推斷 > 主動詢問\n2. 依 work_type 調整提問策略（new_feature=5W1H, refactor=現狀→理想, bugfix=重現→預期, investigation=觀察→假設）\n3. 如果是結構化模板輸入，直接進入確認+補充模式，跳過探索式提問\n4. 使用 sequential-thinking 分析需求各面向\n5. 依六維度框架（.claude/references/exception-discovery-framework.md）主動探測例外情境，每個維度確認後分配 E{N} 編號\n6. 最終產出需求共識（含 work_type）並記錄於 sdd_context.json",
  description: "S0 需求討論"
)
```

---

## 核心原則

> **S0 是討論，不是單向分析。** 先輸出初步理解 → 主動提出確認問題 → 用戶回應後修正 → 達成需求共識。
>
> **結構化輸入加速原則**：用戶已填模板 = 已完成初步探索，S0 應直接確認而非重複提問。

---

## 任務流程

1. **判斷輸入模式**：結構化模板 or 自然語言
2. **判斷工作類型**（`work_type`）：
   - 模板有勾選 → 直接採用
   - 自然語言 → 信號詞推斷（「新增」→ new_feature、「壞了」→ bugfix、「重構」→ refactor、「調查」→ investigation）
   - 無法推斷 → 主動詢問
3. **初步理解**：核心需求、痛點、目標、使用者情境、成功定義。**依 work_type 調整提問策略**：
   - `new_feature`：標準 5W1H
   - `refactor`：聚焦「哪裡不滿意？理想狀態？」
   - `bugfix`：聚焦「重現步驟？預期 vs 實際？」
   - `investigation`：聚焦「觀察到什麼？初步猜測？」
4. **功能區拆解（FA Decomposition）**：
   - 識別需求中是否包含**多個相對獨立的業務領域**
   - 判斷標準：能否獨立描述 Happy Path？有沒有自己的入口和結束狀態？
   - 產出 FA 識別表（FA ID, 名稱, 一句話描述, 獨立性）
   - 評估拆解策略：
     - 1~2 FA / 低獨立性 → `single_sop`
     - 3~4 FA / 中~高獨立性 → `single_sop_fa_labeled`（一份 spec，按 FA 標籤組織）
     - 4+ FA / 高獨立性 → `multi_sop`（建議拆成多個獨立 SOP）
   - 若推薦 `multi_sop`，主動告知用戶並討論拆分方案
5. **互動確認**（依輸入完整度調整來回次數）：需求是否正確？FA 拆解是否合理？成功標準是否明確？範圍內/外？例外情境？約束？
   - **六維度例外探測**（每個維度至少確認一個探測問題，依 `.claude/references/exception-discovery-framework.md` §1）：
     - 並行/競爭：同一操作能被同時觸發嗎？
     - 狀態轉換：操作中途前置條件有無可能失效？
     - 資料邊界：有無空值、零、超長、邊界情況？
     - 網路/外部：會不會斷線、超時、第三方失敗？
     - 業務邏輯：有無餘額不足、資格失效、規則衝突？
     - UI/體驗：用戶在 Loading 時會不會切頁、殺 App？
6. **Spec Mode 判斷**：Quick（bug fix/≤3檔/無DB API/≤2任務）vs Full Spec（新功能/3+檔/DB API/3+任務），灰色地帶主動問。work_type 傾向參考：
   - `bugfix` → 傾向 Quick（除非跨多模組）
   - `refactor` → 傾向 Full Spec（架構變更需完整分析）
   - `investigation` → 傾向 Full Spec（探索範圍廣）
   - `new_feature` → 依複雜度判斷
7. **方案比較**（`new_feature` / `refactor` 時建議）：
   requirement-analyst 應提出 2-3 個方案比較：
   | 方案 | 概述 | 優勢 | 劣勢 | 推薦 |
   在 S0 Gate 確認前呈現，讓用戶同時確認需求和方向。
   `bugfix`/`investigation` 可跳過。
8. **產出需求共識**：
   - Full Spec：產出 `{spec_folder}/s0_brief_spec.md`（模板 `dev/specs/_templates/s0_brief_spec_template.md`），同步記錄於 `sdd_context.json`。在 Gate 確認前產出，讓用戶可看結構化文件來確認。Brief Spec 必須包含：
     - §4.0 功能區拆解表（FA 識別 + 拆解策略 + 跨 FA 依賴）
     - 每個 FA 各自完整的流程圖區塊（§4.2, §4.3...）
     - 例外流程圖（Mermaid flowchart，紅色節點標記例外路徑，六維度例外標記 FA 歸屬）
   - Quick：需求理解留在對話中，不產出文件。Quick Mode 也需在對話中快速走過六維度精簡探測（見 framework §5），確保每個維度都有探測結果
   - Multi-SOP：若拆解策略為 `multi_sop`，本文件作為 Master Spec，各子 SOP 路徑記錄於 `child_sops`

---

## SDD Context 持久化

> 操作手冊見 `.claude/references/sdd-context-persistence.md`（S0 區段 — 唯一建立者）

S0 **建立** sdd_context.json：version, feature, spec_mode, work_type, s0.output（brief_spec_path, work_type, requirement, goal, pain_points, success_criteria, scope_in/out, constraints, functional_areas, decomposition_strategy, child_sops）
路徑：Quick 與 Full Spec 統一 → `{spec_folder}/sdd_context.json`（Quick 也建立 spec_folder）

---

## S0 Gate

🔴 **必停！等待用戶確認需求理解正確。**

- ✅ 輸入「繼續」或「確認」→ 執行「S0→S1 前端偵測」（見下方）
- ✏️ 提出修改意見 → 調整 brief_spec

---

## S0→S1 前端偵測（MUST — 不可跳過）

> 用戶確認 S0 Gate 後、進入 S1 之前，**必須**執行以下偵測。

### Step 1：前端關鍵字掃描

讀取 `s0_brief_spec.md` 全文，掃描以下關鍵字（不區分大小寫）：

```
畫面、頁面、screen、UI、表單、form、列表、list、Dashboard、
按鈕、button、導航、nav、modal、dialog、tab、卡片、card、
輸入、input、前端、frontend、web、app、mobile、RWD、responsive、
sidebar、SwiftUI、Flutter、React、Vue、頁、介面、Client
```

- 命中 **≥ 2 個不同關鍵字** → 進入 Step 2
- 命中 **< 2** → 跳過，直接進入 S1

### Step 2：前置設計檔案偵測

檢查是否有既有的設計資產：

1. **Spec 目錄內**：`{spec_folder}/frontend/flowchart.html`、`wireframe.html`、`mockup.html`
2. **brainstorm-server session**：`ls -td .superpowers/brainstorm/*/ 2>/dev/null | head -1` → 檢查 session 內是否有 `mockup.html`、`flowchart.html`、`wireframe.html`

**若找到既有設計檔案**：
- 複製到 `{spec_folder}/frontend/`（`mkdir -p` 確保目錄存在）
- 更新 `sdd_context.json` 的 `stages.s0.output.frontend_design` 對應路徑
- 告知用戶：「偵測到既有設計檔案，已整合到 spec 目錄。」

### Step 3：自動觸發前端設計管線

依序調用：

1. **flowchart skill**（Pipeline 模式）→ 若 `flowchart.html` 已存在則跳過
2. **wireframe skill**（Pipeline 模式）→ 若 `wireframe.html` 已存在則跳過
3. 完成後自動進入 S1

> mockup 不在此自動鏈中（手動觸發），但若 Step 2 偵測到既有 mockup 會自動整合。

---

**S1 會執行：**
1. 經驗掃描（掃 pitfalls.md + 歷史 lessons_learned，避免重蹈覆轍）
2. Codebase 探索（影響範圍盤點、依賴分析）
3. 技術方案設計（架構決策、風險評估）
4. 任務拆分 + DoD 定義
5. 產出 `s1_dev_spec.md`（Full Spec）或對話中技術分析（Quick）

> 推進責任：用戶確認後，主對話 context 執行前端偵測 → 調用 S1 Skill，由 S1 推進 `current_stage` → S1。
