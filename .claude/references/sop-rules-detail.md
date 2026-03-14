# SOP 詳細規則

> CLAUDE.md 只保留管線摘要與觸發規則，詳細規則見本文件。
> 完整 SOP 階段定義見 `sop-full-spec.md`

## Gate 策略總表

> 智慧調度協議見 `.claude/references/conductor-protocol.md`

### Autopilot 模式（預設）

| 轉換 | 行為 | 說明 |
|------|------|------|
| 需求→S0 | 🟢 **自動** | 識別到需求描述，自動啟動 S0 |
| S0→S1 | 🔴 **必停** | brief_spec 完成，**唯一硬門**，等待用戶確認 |
| S1→S2 | 🟢 **自動** | dev_spec 完成，自動進入 Spec Review |
| S2→S3 | 🟢 **自動** | 審查通過→自動進 S3 |
| S3→S4 | 📋 **摘要通知** | 顯示波次/任務數，自動繼續 |
| S4→S5 | 🟢 **自動** | 實作完成，自動進入 Code Review |
| S5 | 🟢 **自動** | pass→S6 / P1→回S4（≤3次）/ P0→⚠️中斷 |
| S5→S6 | 🟢 **自動** | Code Review 通過，自動進入測試 |
| S6→S7 | 🟢 **自動** | 測試全過，自動提交 |
| S7 完成 | 🟢 **自動 commit** | 自動 git commit（不 push），顯示完成通知 |

### Semi-Auto 模式

| 轉換 | 行為 | 說明 |
|------|------|------|
| 需求→S0 | 🟢 **自動** | 識別到需求描述，自動啟動 S0 |
| S0→S1 | 🔴 **必停** | brief_spec 完成，等待用戶確認需求理解正確 |
| S1→S2 | 🟢 **自動** | dev_spec 完成，自動進入 Spec Review |
| S2→S3 | 🔄 **智慧判斷** | 審查通過→自動進 S3；有問題→討論調整 spec |
| S3→S4 | 🔴 **必停** | 執行計畫完成，**必須**等待用戶確認才開始寫碼 |
| S4→S5 | 🟢 **自動** | 實作完成，自動進入 Code Review |
| S5 | 🔄 **智慧判斷** | P0→回 S1 / P1→回 S4 / 通過→S6 |
| S5→S6 | 🟡 確認 | Code Review 通過，等待確認進入測試 |
| S6→S7 | 🟡 確認 | 測試全過→確認提交；有缺陷→閉環修復後再確認 |

**迴路安全閥**：S4↔S5 最多 3 次、S4↔S6 最多 3 次，超過後停下讓用戶裁決。

## Spec Mode 判斷規則

- **Quick**：bug fix / ≤3 檔 / 不涉及 DB/API 變更 / ≤2 任務 → 不寫 spec、S2 跳過
- **Full Spec**：新功能 / 3+ 檔 / DB/API 變更 / 3+ 任務 → 產出 .md、S2 對抗式審查
- 灰色地帶主動詢問；用戶可說「寫 spec」或「不用 spec」覆寫

### work_type 與 Spec Mode 關係

| work_type | 傾向 | 說明 |
|-----------|------|------|
| `new_feature` | 依複雜度判斷 | 小功能可 Quick，大功能 Full Spec |
| `refactor` | Full Spec | 架構變更需完整分析，除非是小範圍 rename/extract |
| `bugfix` | Quick | 除非跨多模組或涉及架構問題 |
| `investigation` | Full Spec | 探索範圍廣，需結構化記錄發現 |

> work_type 僅作為傾向參考，最終仍以檔案數/任務數/DB-API 規則為準。

## 自動觸發規則

| 模式 | 範例 | 行為 |
|------|------|------|
| 明確需求 | 「我想要...」「幫我新增...」「xxx 壞了」 | 自動 S0 |
| 功能請求 | 「可以做...嗎」「開始SOP:」 | 自動 S0 |
| 簡單問答 | 「這是什麼？」「查一下」「你好」 | 直接回應，不觸發 SOP |
| 明確排除 | 「不要 SOP」「直接回答」 | 跳過 SOP |

> **判斷原則**：「幫我 + 查/看/跑/確認」→ 直接操作；「幫我 + 新增/做/改/加/修」→ 啟動 SOP。

### work_type 自動推斷提示

| 用戶語句特徵 | 推斷 work_type | 信心 |
|-------------|---------------|------|
| 「新增」「做一個」「加入」「支援」 | `new_feature` | 高 |
| 「壞了」「錯誤」「bug」「不正常」「crash」「修復」 | `bugfix` | 高 |
| 「重構」「優化」「整理」「改善」「拆分」「解耦」 | `refactor` | 高 |
| 「調查」「為什麼」「怎麼回事」「查一下（+ 具體問題）」 | `investigation` | 中 |
| 混合信號（如「壞了，要重構」） | 主動詢問 | 低 |

> 推斷後仍需向用戶確認。「查一下」若無具體問題方向，不觸發 SOP（屬於簡單問答）。

## 控制語彙

| 指令 | 作用 |
|------|------|
| `繼續` / `OK` / `確認` | 確認當前階段，進入下一階段 |
| `修改: ...` | 提供修改意見，重新執行當前階段 |
| `跳到 S4` | 跳過中間階段，直接進入指定階段 |
| `重跑 S1` | 重新執行指定階段 |
| `進度?` | 查看當前 SOP 進度 |
| `取消` | 詢問取消原因 → 寫入 mini lessons_learned → 設定 cancelled（見 persistence 手冊） |
| `Full-Auto` / `Semi-Auto` / `Manual` | 切換模式（⚠️ 目前僅 Semi-Auto 已實作） |
| `不要修改檔案` / `不要動資料庫` / `回滾` | 安全停損 |

## 執行權限策略

| 操作類型 | 權限 |
|---------|------|
| 讀取/分析 | 自動執行 |
| 寫入 | S3 確認後才執行 |
| 建置 | S5 自動（flutter analyze, dotnet build） |
| 測試 | S4 TDD 三步驟（RED→GREEN→REFACTOR）；S6 TDD 審計 + E2E/整合驗收 |
| Git | S7 確認後 |
| 破壞性操作 | 永遠需要三次確認 |

## 產出物與完成定義（DoD）

- **DoR**：類型、背景目標、範圍內/外、約束、資料需求、驗收準則
- **DoD**：功能符合需求、S4 每任務走 TDD 三步驟（RED commit → GREEN commit → REFACTOR commit）、TDD 證據完整（`tdd_evidence` in sdd_context，合法 skip 須附 `skip_reason`）、S6 TDD 合規審計通過、E2E/整合測試通過、回歸風險記錄、無 Lint 漂移
- **S0 可選產出**：`s0_wireframe.pen` + `s0_wireframe.png`（前端相關需求時，由 wireframe skill 自動觸發產出）

## Skills 總覽

| 指令 | 階段 | 調度的 Agent |
|------|------|-------------|
| `/s0-understand` | S0 | `requirement-analyst` |
| `/s1-analyze` | S1 | `codebase-explorer` + `architect` |
| `/s2-spec-review` | S2 | Codex 或 Opus + `architect` |
| `/s3-plan` | S3 | `architect` |
| `/s4-implement` | S4 | manifest 可用的 stack agents，或 Orchestrator 直接實作 |
| `/s5-review` | S5 | `reviewer` + 對抗式審查引擎 |
| `/s6-test` | S6 | `test-engineer` |
| `/s6-manual-test` | S6 (手動) | —（互動式，不調度 Agent） |
| `/s7-commit` | S7 | `git-operator` |
| `/debug` | 輔助 | `debugger` |
| `/spec-review` | 手動 | Codex 或 Opus + `architect`（任何時候） |
| `/code-review` | 手動 | Codex 或 Opus + `reviewer`（支援 `s5` scoped diff） |
| `/design` | 設計 | `uiux-designer`（需 pencil-ui stack） |
| `/verify` | 輔助 | `codebase-explorer`（可選）/ `sql-expert`（需 database stack） |
| `/explore` | 輔助 | —（直接執行，不調度 Agent） |
| `/demo` | 輔助 | —（直接執行，不調度 Agent） |
| `/git-analyze` | 輔助 | -（分析分支） |
| `/git-extract` | 輔助 | -（提取變更） |
| `/git-merge` | 輔助 | -（合併） |
| `/handoff` | 輔助 | -（跨視窗橋接） |
| `/spec-audit` | S5 / 手動 | 6-Agent 並行（Explore subagents） |

## Agents 總覽

> Orchestrator 不是 Task 可調度的 agent，行為規範見 `orchestrator-behavior.md`

| Agent | 模型 | 專長 | 階段 |
|-------|------|------|------|
### 核心 Agents（始終可用）

| Agent | 模型 | 專長 | 階段 |
|-------|------|------|------|
| `requirement-analyst` | sonnet | 需求討論 | S0 |
| `codebase-explorer` | sonnet | 代碼探索 | S1 |
| `architect` | opus | 架構設計 | S1 + S2 + S3 |
| `reviewer` | opus | 程式碼審查 | S5 |
| `test-engineer` | sonnet | 測試/驗收 | S6 |
| `git-operator` | sonnet | Git 操作 | S7 |
| `debugger` | sonnet | 錯誤診斷 | 任何錯誤時 |
| `frontend-developer` | sonnet | 前端開發 | S4 前端 |
| `scope-planner` | sonnet | 範圍規劃 | `/scope` |
| `uiux-designer` | sonnet | UI/UX 設計 | `/design` |
| `general-purpose` | sonnet/opus | 通用任務（非專家） | 對抗式審查 R1/R3、Codex fallback |
| `general-purpose`（S4 mini-review） | sonnet | 逐任務 DoD + 品質快速檢查 | S4（Full Spec） |

### Stack-Specific Agents（依安裝 stack 而定）

> 以下 agent 僅在對應技術棧已安裝時存在。查詢 `.claude/manifest.json` 確認可用 agents。

| Agent | 模型 | 專長 | 需要 Stack | 階段 |
|-------|------|------|-----------|------|
| `flutter-expert` | sonnet | Flutter/Dart/BLoC | flutter | S4 前端 |
| `dotnet-expert` | sonnet | .NET/Clean Arch | dotnet | S4 後端 |
| `sql-expert` | sonnet | MySQL/Schema | database | S4 資料庫 |
| `nestjs-api-engineer` | sonnet | NestJS Controller/DTO | nestjs | S4 後端 |
| `nestjs-service-engineer` | sonnet | NestJS Service/Prisma | nestjs | S4 後端 |
| `prisma-engineer` | sonnet | Prisma Schema/Migration | nestjs | S4 資料層 |

> `general-purpose` 是 Claude Code 內建通用 Agent type，不需要 `.claude/agents/` 定義檔。用於搭配 `model` 參數執行不需專家 Agent 的任務（如對抗式審查 R1 挑戰、R3 裁決、Codex fallback 時的 Opus 替代）。

## 強制觸發規則

### MUST：Skill 調用

| 關鍵字/情境 | 必須調用 |
|-------------|----------|
| 「開始SOP:」「新需求」「我想要」 | `Skill(skill: "s0-understand")` |
| 「分析」「影響範圍」 | `Skill(skill: "s1-analyze")` |
| 「審查 spec」（管線內） | `Skill(skill: "s2-spec-review")` |
| 「規劃」「計畫」 | `Skill(skill: "s3-plan")` |
| 「實作」「開始寫」 | `Skill(skill: "s4-implement")` |
| 「審查」「review」 | `Skill(skill: "s5-review")` |
| 「測試」「驗收」 | `Skill(skill: "s6-test")` |
| 「手動測試」「manual test」「繼續測試」 | `Skill(skill: "s6-manual-test")` |
| 「提交」「commit」 | `Skill(skill: "s7-commit")` |
| 「設計」「畫 UI」「mockup」 | `Skill(skill: "design")` |
| 「審查 spec/code」（手動） | `Skill(skill: "spec-review")` / `Skill(skill: "code-review")` |
| 「驗證」「搞清楚」「核對」「確認一下」「分析一下」 | `Skill(skill: "verify")` |
| 「看看能不能」「評估」「feasibility」「探索」「scope check」「能做嗎」 | `Skill(skill: "explore")` |
| 「收斂 spec」「converge spec」「跟 codex 對齊」「spec 收斂」 | `/spec-converge` |
| 「審計 spec」「audit spec」「spec vs code」「追蹤 flow」「深度比對」 | `Skill(skill: "spec-audit")` |
| 「清理磁碟」「disk cleanup」「清 session」「clean sessions」 | `/disk-cleanup` |
| 「demo」「tunnel」「開隧道」「測試環境」 | `Skill(skill: "demo")` |

### MUST：Task tool 調度 Agent

執行 Skill 內的專業任務時，**必須**使用 `Task` tool 調度對應 Agent。

### S4 實作調度

> 先查 `.claude/manifest.json` 確認可用 agents。有 stack agent 就 dispatch，沒有就由 Orchestrator 直接實作。

| 任務類型 | 判斷依據 | Agent | 條件 |
|---------|---------|-------|------|
| 錯誤 | 任何錯誤/異常 | `debugger` | 始終可用 |
| 資料層 | Schema/Migration/Query | `sql-expert` | 需 database stack |
| 後端（.NET） | Controller, Service, Repository | `dotnet-expert` | 需 dotnet stack |
| 後端（NestJS） | Controller, Service, DTO | `nestjs-api-engineer` | 需 nestjs stack |
| 前端（Flutter） | BLoC, Page, Widget | `flutter-expert` | 需 flutter stack |
| 前端（通用） | Component, Page, Style | `frontend-developer` | 始終可用 |
| 無對應 agent | 任何 | Orchestrator 直接實作 | — |

### 全自動觸發

| 情境 | 自動調用 |
|------|---------|
| 遇到錯誤/異常/測試失敗 | `Task(subagent_type: "debugger", ...)` |
| 「深入分析」「think hard」 | `mcp__sequential-thinking__sequentialthinking` |
| 「資料庫」「SQL」「查詢」 | `mcp__genaiToolbox__execute_sql`（需 database stack） |

**核心原則**：偵測到 SOP 需求 → 調用 Skill → Skill 內調度 Agent。禁止跳過 Skill 直接回覆、禁止跳過 Agent 自己寫碼/審查。
