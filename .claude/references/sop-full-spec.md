# SOP 完整定義（Full Specification）

> 本檔案包含 S0~S7 階段的完整定義、文件產出機制、知識管理規則。
> CLAUDE.md 保留精簡概覽，詳細規則引用此處。

## S0~S7 階段完整定義

### S0 需求討論（互動式）
- **Agent**：`requirement-analyst`
- 內容：與用戶互動討論需求，反覆確認痛點、目標與成功標準，直到雙方共識
- 產出：`s0_brief_spec.md` + `sdd_context.json`（Full Spec）/ 對話中的需求摘要（Quick）
- 特點：**這是討論階段**，會有多次來回對話，不是單向分析
- **Spec Mode 判斷**：由 `requirement-analyst` 在互動確認後，依據 Spec Mode 判斷規則決定 `spec_mode`（Quick / Full Spec），填入 SDD Context
- Gate：🔴 **必停！需求共識需用戶確認才進入 S1**

### S1 技術分析（探索 + 開發規格）
- **Agent**：`codebase-explorer`（探索）+ `architect`（規格撰寫）
- 內容：依據 brief_spec 詳細探索 codebase 現狀，評估影響範圍、識別風險、設計技術方案
- 產出：`s1_dev_spec.md`（Full Spec）/ 對話中的技術分析與方案（Quick）
- 特點：探索過程中若發現需求與現有技術有衝突，可與用戶討論調整
- Gate：🟢 **自動進入 S2 Spec Review**

### S2 Spec Review（對抗式審查）
- **Agent**：Codex（預設）或 Opus Agent + `architect`
- 內容：審查 dev_spec 是否正確符合 brief_spec、是否具備效能與開發效益
- Full Spec 模式：完整對抗式 3 輪審查（R1 挑戰 → R2 防禦 → R3 裁決）
- Quick 模式：**跳過 S2**（任務規模小，品質把關延後到 S5 Code Review）
- 產出：`s2_review_report.md`（Full Spec）/ 跳過記錄（Quick）
- Gate：🔄 **智慧判斷**（通過→S3 / 有問題→討論調整 spec 後重審 / Quick→直接 S3）
- **迭代收斂**：若 S2 審查後仍有殘留 issue，可使用 `/spec-converge` 命令進入迭代收斂迴圈（Codex 審查 → Claude 修正，最多 5 輪，直到 P0=P1=P2=0）

### S3 執行計畫
- **Agent**：`architect`
- 內容：依照 brief_spec + dev_spec 產出詳細執行計畫，明確切分任務與波次
- **執行順序原則**：DB → Backend → Frontend；可並行的任務明確標出
- 產出：`s3_implementation_plan.md`（Full Spec）/ TaskList（Quick）
- Gate：**模式決定** — Autopilot：📋 摘要通知後自動進入 S4 / Semi-Auto：🔴 必停確認後才開始寫碼

### S4 實作（TDD 驅動）
- **Agent**：manifest 可用的 stack agents，或 Orchestrator 直接實作（根據任務類型）
- 內容：依照 S3 執行計畫，每個任務走 Red-Green-Refactor 三步驟。先寫失敗測試（RED commit）→ 實作讓測試通過（GREEN commit）→ 重構（REFACTOR commit，可選）
- 產出：變更清單、受影響檔案、TDD 證據（red/green output + commit hash）、tdd_summary
- **完成定義**：每個任務的 `tdd_evidence` 完整（或合法 skip），所有測試通過
- Gate：🟢 **自動進入 S5 Code Review**

### S5 Code Review（對抗式審查 + 品質審視）
- **Agent**：`reviewer` + 對抗式審查引擎（Codex 預設，或 Opus fallback）
- 內容：對照 brief_spec + dev_spec 審查實作是否正確、架構審視、品質把關
- **審查範圍**：自動從 `sdd_context.stages.s4.output.changes` 提取檔案清單做 **scoped diff**
- 產出：審查報告（含對抗式審查結果）、問題分類、處理建議
- Gate：🟡 **確認**（通過→等待確認進 S6 / P1→回 S4 / P0→回 S1 / 分歧→用戶裁定）

#### S5 審查核心

**驗證核心**：對照 brief_spec + dev_spec 確認實作正確性
- Full Spec → 對照 `s1_dev_spec.md` + `s0_brief_spec.md`
- Quick → 對照對話中的 S0/S1 分析結果

**問題分類**：
- P0 設計問題 → 回 S1
- P1 實作問題 → 回 S4
- P2 改善建議 → 記錄後繼續

**架構審視**：邏輯正確性、Hard-coded、重複造輪子

### S6 驗收測試（TDD 審計 + E2E + 整合）
- **Agent**：`test-engineer` + `debugger`（缺陷時）
- 內容：Phase 1 TDD 合規審計（阻斷 Gate）→ Phase 2 驗收測試（E2E + 整合 + 手動清單）→ Phase 3 缺陷閉環
- 產出：TDD 審計報告、驗收測試結果、`s6_test_checklist.md`（Full Spec 視需要）、缺陷報告
- **TDD 審計**：驗證 S4 tdd_evidence 完整性，compliance < 100%（扣除合法 skip）→ P1 回 S4
- **閉環機制**：缺陷修復後也必須走 TDD（red→green commit pair）→ 最多 3 次
- Gate：🟡 **確認**（TDD 合規 + 驗收通過→S7 / TDD 不合規→回 S4 / 修復超 3 次→用戶裁決）

### S7 提交（人工確認）
- **Agent**：`git-operator`
- 內容：整理變更、生成 commit、執行提交、生成 lessons_learned
- 產出：commit hash、變更記錄、lessons_learned
- Gate：🟡 SOP 流程結束

## S5 智慧回饋迴路

| 審查結果 | 問題類型 | 自動處理 |
|---------|---------|---------|
| ✅ 通過 | 無問題 | 等待確認進入 S6 |
| ⚠️ P1 問題 | 實作層問題（邏輯錯誤、硬編碼、重複代碼、違規） | 自動回到 S4 修復 |
| 💡 P2 建議 | 可優化但不阻擋（命名、風格、小優化） | 記錄後繼續 |
| 🔴 P0 問題 | 設計層問題（Spec 錯誤、需求理解偏差、架構衝突） | 自動回到 S1 重新分析 |

**迴路安全閥**：S4↔S5 迴路最多 3 次，超過後停下讓用戶裁決。

## S6 驗收測試閉環

| 測試結果 | 處理方式 |
|---------|---------|
| ✅ TDD 審計通過 + 驗收全過 | 等待確認進入 S7 提交 |
| ❌ TDD 審計失敗 | P1 回 S4 補齊 TDD 證據 |
| ❌ E2E/整合測試有缺陷 | 調度 `debugger` 診斷 + 對應實作 Agent 修復（修復也走 TDD）→ 重新測試 |

**閉環安全閥**：S4↔S6 修復迴路最多 3 次，超過後停下讓用戶裁決。

---

## Spec Mode 判斷規則

### Quick（對話模式）
- bug fix / 文字調整 / 樣式微調
- 影響 ≤ 3 檔
- 不涉及 DB schema / API 契約變更
- 任務 ≤ 2 個

### Full Spec（文件模式）
- 新功能開發
- 跨模組 3+ 檔
- DB schema 變更、API 契約變更
- 架構調整 / 重構
- 任務 3+ 個

### 灰色地帶
主動詢問用戶要不要寫 spec。

### 用戶覆寫權

| 用戶指令 | 效果 |
|---------|------|
| 「寫 spec」、「要 spec」、「寫文件」 | 強制 Full Spec |
| 「不用寫 spec」、「不要文件」、「快速處理」 | 強制 Quick |

### 模式差異

- Quick → 結果留在對話中，S2 跳過，品質把關延後到 S5
- Full → 產出 .md 文件，S2 走完整對抗式審查

### Quick 模式風險聲明

Quick 模式跳過 S2 Spec 審查，**需求理解正確性完全依賴 S0 階段的互動確認**。S5 Code Review 只能驗證「實作是否符合 S0/S1 分析」，無法驗證「分析是否符合真實需求」。

**適用建議**：
- ✅ 明確的 bug fix、文字微調、樣式調整
- ✅ 用戶能精準描述預期行為的小修改
- ❌ 複雜需求、多角色互動、涉及狀態機的變更 → 應使用 Full Spec

---

## 文件目錄結構（Full Spec 模式）

```
dev/specs/{YYYY-MM-DD}_{N}_{功能名稱}/
├── s0_brief_spec.md              # S0 產出，需求規格
├── s1_dev_spec.md                # S1 產出，技術方案（供 S2 審查）
├── s2_review_report.md           # S2 產出，審查報告（Full Spec 模式）
├── s3_implementation_plan.md     # S3 產出，供 S4 執行
├── s5_code_review_report.md     # S5 產出，Code Review 報告（Full Spec 模式）
├── s6_test_checklist.md          # S6 產出（視需要）
├── sdd_context.json              # SDD Context 持久化
└── flows/                        # 流程圖（可選）
    ├── user_flow.md
    └── data_flow.md
```

**命名規則**：
- 日期＋序號：`YYYY-MM-DD_N`（N 為當日序號，從 1 起算）
- 功能名稱：kebab-case
- **檔名前綴慣例**：`sN_` 代表「由 SN 階段產出」

**模板位置**：`dev/specs/_templates/`

## 文件生成規則

### Full Spec 模式

1. S0 → `s0_brief_spec.md` + 需求共識記錄於 `sdd_context.json`
2. S1 → `s1_dev_spec.md`（技術分析 + 技術方案合一）
3. S2 → `s2_review_report.md`（審查結果 + 修正軌跡）+ 修正 `s1_dev_spec.md`
4. S3 → `s3_implementation_plan.md`（持續更新進度）
5. S4 → 更新 implementation_plan 狀態
6. S5 → `s5_code_review_report.md`（審查結果 + 攻防軌跡）+ 對照 brief_spec + dev_spec 驗證
7. S6 → `s6_test_checklist.md`（涉及 UI/購買/狀態機時）

### Quick 模式

- 不產出 spec 文件
- S0/S1 結果留在對話中
- S2 跳過
- S3/S4 用 TaskList 追蹤
- S5 對照對話中的分析

---

## 知識管理：Pitfalls Registry

**位置**：`dev/knowledge/pitfalls.md`

**格式**：
```markdown
### [tag] 簡短標題
- **錯誤**：描述錯誤做法
- **正確**：描述正確做法
- **影響**：（選填）後果
- **來源**：功能名稱 (日期)
```

**可用 tag**：`db`, `flutter`, `dotnet`, `arch`, `security`, `test`, `design`, `api`

**Tag 分配規則**（確保一致性，禁止自創 tag）：

| Tag | 適用範圍 |
|-----|---------|
| `db` | 資料庫 Schema、索引、Migration、查詢效能 |
| `flutter` | Flutter/Dart/BLoC/UI 元件/設計系統 |
| `dotnet` | .NET/C#/API/Service/Repository/Domain |
| `arch` | 架構設計、模組依賴、跨層協作 |
| `security` | 安全漏洞、權限、加密、Token、注入防護 |
| `test` | 測試策略、覆蓋率、Mock、測試環境 |
| `design` | 設計系統元件、UX 流程、互動模式 |
| `api` | API 契約、版本、錯誤處理、DTO |

### 自動追加規則

| 階段 | 觸發條件 | Agent |
|------|---------|-------|
| S5 | 發現 P1 實作問題 | `reviewer` |
| S6 | 發現並修復缺陷 | `test-engineer` |
| S7 | lessons_learned.new_pitfalls | `git-operator` |

### 消費規則（S1 經驗注入）

S1 技術分析時，`codebase-explorer` **必須**：
1. Grep `dev/knowledge/pitfalls.md` 找相關 tag/關鍵字
2. 掃描 `dev/specs/*/sdd_context.json` 的 `lessons_learned`
3. 將相關 pitfalls 注入 dev_spec 的「風險評估」區段

## Lessons Learned（S7 自動捕獲）

S7 提交前，`git-operator` **必須**生成：
- `what_went_well`：做得好的地方
- `what_went_wrong`：踩到的坑、重工原因
- `new_pitfalls`：格式 `[tag] 描述`

流程：生成 → 寫入 sdd_context.json → new_pitfalls append 到 pitfalls.md

---

## 強制觸發規則

### 關鍵字 → Skill → Agent 映射

| 關鍵字/情境 | 必須調用 | 調度的 Agent |
|-------------|----------|-------------|
| 「開始SOP:」、「新需求」、「我想要」 | `Skill(skill: "s0-understand")` | `requirement-analyst` |
| 「分析」、「看一下 codebase」、「影響範圍」 | `Skill(skill: "s1-analyze")` | `codebase-explorer` + `architect` |
| 「審查 spec」（管線內自動觸發） | `Skill(skill: "s2-spec-review")` | Codex 或 Opus + `architect` |
| 「規劃」、「怎麼做」、「計畫」 | `Skill(skill: "s3-plan")` | `architect` |
| 「實作」、「開始寫」、「動手」 | `Skill(skill: "s4-implement")` | 根據任務類型 |
| 「審查」、「review」、「檢查」 | `Skill(skill: "s5-review")` | `reviewer` |
| 「測試」、「驗收」、「E2E」 | `Skill(skill: "s6-test")` | `test-engineer` |
| 「提交」、「commit」、「收尾」 | `Skill(skill: "s7-commit")` | `git-operator` |
| 「設計」、「畫 UI」、「原型」 | `Skill(skill: "design")` | `uiux-designer`（需 pencil-ui stack） |

### S4 實作調度

> **Manifest-Aware**：讀取 `.claude/manifest.json` 確認可用 agents。有 stack agent 就 dispatch，沒有就由 Orchestrator 直接實作。

| 任務類型 | 判斷依據 | Agent | 條件 |
|---------|---------|-------|------|
| 前端邏輯/UI | Page, Widget, Component | `frontend-developer` | 始終可用 |
| 錯誤 | 任何錯誤或異常 | `debugger` | 始終可用 |
| 資料層分析 | Schema 設計、索引規劃 | `sql-expert` | 需 database stack |
| 資料層實作 | Entity, Migration, DbContext | `dotnet-expert` | 需 dotnet stack |
| 後端邏輯/API | Service, Controller, DTO | `dotnet-expert` | 需 dotnet stack |
| Flutter 前端 | BLoC, Flutter Widget | `flutter-expert` | 需 flutter stack |
| NestJS 後端 | Controller, Service, Prisma | `nestjs-api-engineer` | 需 nestjs stack |

### 全自動觸發

| 情境 | 自動調用 |
|------|---------|
| 遇到錯誤/異常/測試失敗 | `Task(subagent_type: "debugger", ...)` |
| 「深入分析」、「think hard」 | `mcp__sequential-thinking__sequentialthinking` |
| 「資料庫」、「SQL」、「查詢」 | `mcp__genaiToolbox__execute_sql`（需 database stack） |

## 上下文傳遞 JSON 格式

> 完整 schema 見 `.claude/references/sdd-context-schema.md`

Skills 之間使用 `sdd_context` JSON 傳遞上下文，**必須**記錄調度的 Agent。
