---
description: "技能推薦員 — 分析意圖後推薦最佳 Skill 或組合技，產出可直接複製的執行 prompt，也可當場執行。Use when 用戶不確定該用哪個 skill、想了解可用工具、或描述了一個目標但不知從何下手。Do NOT use when 用戶已明確指定要用的 skill（直接調用該 skill）。觸發：「怎麼查」「怎麼做」「可以怎麼用」「有什麼工具」「推薦」「suggest」「該用什麼」「哪個 skill」"
allowed-tools: Read, Grep, Glob, AskUserQuestion
argument-hint: "<想做的事情描述>"
---

# /suggest — 技能推薦員

> 分析用戶意圖 → 推薦最佳 Skill/組合技 → 產出可複製的執行 prompt → 可選直接執行或複製到新 session 使用。

## 輸入
用戶意圖：$ARGUMENTS

---

## Phase 1：意圖理解

### 1A. 意圖明確 → 直接分類

若 $ARGUMENTS 足夠具體（包含動詞 + 對象），直接判斷意圖類別：

| 意圖類別 | 信號詞 | 對應 Skill 池 |
|---------|--------|--------------|
| **狀態盤點** | 做了多少、完成度、進度、狀態 | explore, verify, spec-audit |
| **事實核對** | 對不對、一致嗎、核對、是否正確 | verify |
| **開發新功能** | 新功能、我想做、新增、實作 | autopilot, s0-understand, brainstorming |
| **修 Bug** | 壞了、報錯、crash、exception | debug, systematic-debugging |
| **審查品質** | review、看看這段、品質、審查 | code-review, spec-review, requesting-code-review |
| **測試驗收** | 測試、跑 test、驗收、E2E | s6-test, s6-manual-test, TDD |
| **設計 UI** | 設計、畫、原型、mockup | design, flowchart（需 pencil-ui stack） |
| **Git 操作** | 分支、合併、提取、cherry-pick | git-analyze, git-extract, git-merge |
| **Spec 打磨** | spec 品質、收斂、對齊 | spec-converge, review-dialogue, spec-review |
| **Session 管理** | 交接、切 session、resume | handoff, resume-id |
| **探索評估** | 能不能做、可行性、影響範圍 | explore |
| **架構分析** | 架構、結構、分層、依賴 | architecture |
| **並行開發** | 同時做、並行、worktree | parallel-develop |
| **範圍評估** | 範圍、scope、多大、多複雜 | scope |

### 1B. 意圖模糊 → 問答釐清

若 $ARGUMENTS 模糊或可歸入多個類別，用 AskUserQuestion 釐清：

**問題設計原則**：最多 2 個問題，每題 2~4 選項，聚焦在「你想達成什麼」而非「你想用什麼工具」。

範例問題模式：

```
Q1：你的目標比較接近？
  A. 了解現況（看進度、查資料、確認事實）
  B. 推動進展（開發、修復、測試）
  C. 品質把關（審查 code、打磨 spec）
  D. 管理流程（交接、切分支、清理）

Q2（依 Q1 細化）：
  若 A → 要看全貌還是查特定細節？
  若 B → 已有 spec/計畫嗎？還是從零開始？
  若 C → 審查對象是 code 還是 spec？
  若 D → 是跨 session 交接還是 git 操作？
```

---

## Phase 2：上下文感知

意圖確認後，自動收集上下文以細化推薦：

1. **SOP 狀態**：掃描 `dev/specs/` 下的 sdd_context.json
   - 有活躍 SOP → 優先推薦 SOP 管線內 skill，標注 Superpowers 被抑制
   - 無活躍 SOP → SDD 和 Superpowers 都可推薦
2. **當前分支**：判斷工作上下文
3. **意圖涉及的功能模組**：依 repo 結構判斷
4. **複雜度判斷**：
   - 簡單（單一操作）→ 推薦單一 skill
   - 複雜（多步驟）→ 推薦組合技

---

## Phase 3：推薦方案 + 執行 Prompt

### 輸出結構

分三個區塊輸出，每個區塊都是必要的：

#### 區塊 1：總覽表

快速列出所有適用方案，讓用戶一眼掃過：

```markdown
## 推薦方案

| # | 面向 | Skill | 一句話說明 |
|---|------|-------|-----------|
| 1 | {面向} | `/skill-name` | {為什麼適合} |
| 2 | {面向} | `/skill-name` | {為什麼適合} |
| 3 | {面向} | `/skill-name` | {為什麼適合} |
```

#### 區塊 2：最推薦方案 + 可複製 Prompt（展開 1~2 個最佳選項）

每個推薦方案必須包含一個**完整的、可直接複製貼到新 session 使用的 prompt**。

prompt 設計原則：
- 包含完整上下文（功能名稱、路徑、當前狀態）
- 用戶不需要再補充任何資訊就能直接使用
- 若涉及 SOP，包含 sdd_context 路徑
- 若涉及 spec，包含 spec 目錄路徑

格式：

```markdown
### 推薦 1：{skill 名}（{一句話定位}）

**適合原因**：{為什麼這是最佳選擇}
**預期輸出**：{用了之後會得到什麼}

📋 **直接複製使用**：
‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
{完整 prompt，包含所有必要上下文，可直接貼到新 session}
‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
```

**Prompt 模板庫**（按意圖類別）：

**狀態盤點**：
```
/explore {功能名稱}目前完成多少，還有哪些待辦
```

**深度審計**：
```
/spec-audit {spec_folder_path}
```

**事實核對**：
```
/verify {具體核對問題，含模組名+API名+預期行為}
```

**開發新功能**：
```
開始SOP: {需求一句話描述}

背景：{2~3 句上下文}
目標：{預期達成效果}
```

**修 Bug**：
```
/debug {錯誤描述}

重現步驟：{步驟}
錯誤訊息：{error message}
影響範圍：{哪裡壞了}
```

**審查**：
```
/code-review

範圍：{變更檔案清單或 git diff 範圍}
重點關注：{特別要看的面向}
```

**組合技 Prompt**（多步驟時，提供完整序列）：
```
# Step 1（本 session 或新 session）
{第一個 skill 的完整 prompt}

# Step 2（接續或另開 session）
{第二個 skill 的完整 prompt}
```

#### 區塊 3：行動選擇

推薦完畢後，用 AskUserQuestion 讓用戶選擇下一步：

```
Q：你想怎麼處理？
  A. 直接執行（在本 session 調用推薦的 skill）
  B. 複製到新 session 執行（本 session 保持監控）
  C. 看更多選項（展開其他推薦方案的詳細 prompt）
  D. 調整推薦（描述不太對，重新釐清意圖）
```

- 選 A → 直接調用對應 Skill tool 執行
- 選 B → 確認用戶已複製，提示：`開一個新 claude session，貼上 prompt 即可`
- 選 C → 展開其他方案的完整 prompt
- 選 D → 回到 Phase 1B 問答釐清

---

## Skill 匹配池

### Layer 1：SDD Skills（`.claude/commands/*.md`）

| 系統 | Skills |
|------|--------|
| SOP 管線 | autopilot, s0-understand, s0-prepare, s1-analyze, s2-spec-review, s3-plan, s4-implement, s5-review, s6-test, s6-manual-test, s7-commit |
| 審查系 | code-review, spec-review, spec-converge, review-dialogue, spec-audit |
| 探索系 | explore, verify, debug, scope |
| Git 系 | git-analyze, git-extract, git-merge |
| 工作流 | handoff, resume-id, disk-cleanup, parallel-develop |
| 架構系 | architecture, cross-validate |
| 展示系 | demo |

> **Stack-Conditional Skills**：部分 Skill 僅在安裝對應 stack 後可用（如 design/flowchart 需 pencil-ui、e2e-test 需 testing）。
> 讀取 `.claude/manifest.json` 確認可用的 commands 清單。

### Layer 2：Superpowers

| 系統 | Skills | SOP 活躍時 |
|------|--------|-----------|
| 流程系 | brainstorming, writing-plans, executing-plans, subagent-driven-development | 被抑制 |
| 工程系 | test-driven-development, systematic-debugging, verification-before-completion | 可用 |
| 審查系 | requesting-code-review, receiving-code-review | 可用 |
| 環境系 | using-git-worktrees, finishing-a-development-branch | 可用 |
| 並行系 | dispatching-parallel-agents | 可用 |

### Layer 3：組合技

| 組合技 | 等級 | 連鎖 | 適合 |
|--------|-----|------|------|
| 全自動開發流 | S | /autopilot（S0→S7） | 明確功能開發 |
| Superpowers 全鏈 | S | brainstorming→worktree→plans→subagent→finish | 非 SOP 開發 |
| 緊急 Debug 流 | A | /debug→systematic-debugging→TDD | 生產事故 |
| 對抗式審查加強 | A | S5 + code-reviewer | 高風險變更 |
| Spec 收斂迴圈 | A | /spec-converge ×5 | 複雜 Spec |
| 探索→啟動 | B | /explore→/autopilot | 不確定要不要做 |
| Git 考古術 | B | /git-analyze→/git-extract→/autopilot | 救回舊分支 |
| 手動測試引導 | B | /s6-test→/s6-manual-test | UI 驗收 |

---

## SOP 活躍時的附加提示

若偵測到活躍 SOP，在總覽表下方加一行提示：

```
> SOP 活躍中（{feature} @ {stage}）— Superpowers 流程系被抑制，優先使用 SOP 管線內 skill。
```

---

## 與其他 Skill 的關係

| Skill | 定位 | 差異 |
|-------|------|------|
| `/skillbook` | 技能目錄 | 展示所有技能的完整清單 |
| `/suggest` | 技能推薦 | 根據意圖推薦 + 產出可用 prompt |
| `/explore` | 技術探索 | 實際執行探索分析 |

---

## 使用範例

```
# 查開發狀態
/suggest 我想知道這個功能做到哪了

# 不確定該怎麼開始
/suggest 我想優化這個演算法

# 遇到問題
/suggest server 啟動後一直 500

# 要做 review
/suggest 幫我看看最近寫的 code 品質如何

# 模糊意圖（會觸發問答釐清）
/suggest 這個東西怎麼弄
```
