---
description: "多視角交叉驗證 — 並行派出多個專業 Agent 從不同角度分析已實作的程式碼，合成矛盾與共識報告。比 code-review 更廣（4 視角），比 review-dialogue 更輕（無多輪對話）。觸發：「交叉驗證」、「cross validate」、「多角度分析」、「全面檢查」、「幫我從各個角度看一下」、「xval」"
allowed-tools: Read, Bash, Grep, Glob, Task, Write, mcp__sequential-thinking__sequentialthinking
argument-hint: "[spec_path] [files... | git-diff-range | latest]"
---

# /cross-validate — 多視角交叉驗證

> 多個專業 Agent 並行分析同一組變更，各自產出發現，Orchestrator 交叉比對後合成共識報告。
> 核心價值：單一 Agent 有盲點，多視角交叉能發現「每個人都覺得不是自己的問題」的縫隙。

## 環境資訊
- 當前分支: !`git branch --show-current 2>/dev/null || echo "(未初始化)"`
- 最近變更: !`git log --oneline -5 2>/dev/null || echo "(no commits)"`

## 輸入
驗證目標：$ARGUMENTS

---

## 參數解析

```
/cross-validate [spec_path] [target]
```

### Target（分析什麼）

| 輸入 | 行為 |
|------|------|
| `latest` / 無參數 | `git diff HEAD~1` 取得變更檔案 |
| `HEAD~N..HEAD` | 指定 git diff 範圍 |
| `main` | `git diff main...HEAD`（分支全部變更） |
| `path/to/dir/` | 指定目錄，掃描該目錄下所有檔案 |
| `file1 file2` | 指定具體檔案清單 |

### Spec（可選）

| 輸入 | 行為 |
|------|------|
| `dev/specs/.../` | 讀取該目錄的 `s1_dev_spec.md` + `s0_brief_spec.md` 作為對照基準 |
| 無 | 純 codebase 分析，不對照 spec |

### 範例

```bash
# 最簡：分析最近一次 commit
/cross-validate

# 分析分支全部變更
/cross-validate main

# 附帶 spec 對照
/cross-validate dev/specs/2026-03-01_feature-x/ main

# 指定檔案
/cross-validate src/services/auth.ts src/routes/auth.ts
```

---

## Step 0：專案偵測

在派出 Agent 前，Orchestrator **必須**先偵測專案結構，從 CLAUDE.md 和目錄結構推斷：

### 自動偵測項目

1. **技術棧**：讀取 CLAUDE.md 的「技術棧」或「Repository Guidelines」段落，識別後端框架（Express / NestJS / .NET / FastAPI / …）和前端框架（React / Flutter / Vue / …）
2. **目錄映射**：掃描專案根目錄，建立映射表：
   ```
   backend_dirs: 匹配 backend/, server/, api/, src/api/, src/server/
   frontend_dirs: 匹配 frontend/, app/, client/, web/, src/app/, src/components/
   test_dirs: 匹配 test/, tests/, __tests__/, **/test*/, **/*_test.*, **/*.test.*, **/*.spec.*
   ```
3. **專案特有規範**：從 CLAUDE.md 提取 Coding Style、Repo 特化守則等規範，注入各 Agent 的 prompt

### 偵測失敗處理

- 如果無法判斷技術棧 → 使用「通用全端」模式（不帶框架特定審查項）
- 如果無法區分前後端目錄 → 所有原始碼合併為一組，前端視角改為「UI 層分析」

---

## 四個分析視角

每個視角由一個獨立 Agent 負責，各自帶著不同的「眼鏡」看同一組程式碼。

### 1. 後端架構（Backend Architecture）
**關注點**：依賴注入完整性、Transaction 邊界安全、分層架構一致性、Error handling、API 契約正確性
**Agent**：`general-purpose`（注入後端技術棧 context）

### 2. 前端一致性（Frontend Consistency）
**關注點**：元件/狀態管理 pattern 正確性、設計系統合規、API Client 用法、路由正確性
**Agent**：`general-purpose`（注入前端技術棧 context）

### 3. 測試覆蓋（Test Coverage）
**關注點**：關鍵路徑是否有測試、edge case 覆蓋、mock 正確性、測試命名規範
**Agent**：`general-purpose`（測試聚焦）

### 4. 安全與效能（Security & Performance）
**關注點**：SQL injection / XSS / OWASP Top 10、N+1 查詢、敏感資料外洩、Race condition、資源洩漏
**Agent**：`Explore`（安全聚焦）

---

## 視角選擇（自動）

不是每次都需要全部 4 個視角。根據變更檔案自動判斷：

| 條件 | 啟用視角 |
|------|---------|
| 變更含後端目錄檔案 | 後端架構 ✅ |
| 變更含前端目錄檔案 | 前端一致性 ✅ |
| 變更含測試檔案 | 測試覆蓋 ✅ |
| 變更含任何實作碼 | 安全與效能 ✅ |
| 任一視角命中 | 測試覆蓋 ✅（永遠掃：看有沒有漏測） |

最少啟用 2 個視角（否則用 `/verify` 就夠了）。
若僅命中 1 個視角 → 提示用戶「變更範圍較小，建議改用 `/verify` 或 `/code-review`」。

---

## Agent 調度

### 建構共享 Context

在派出 Agent 前，Orchestrator 先組裝共享 context：

```
1. 取得變更檔案清單（git diff --name-only 或手動指定）
2. 分類：backend_files / frontend_files / test_files（基於 Step 0 的目錄映射）
3. 取得 git diff（完整 diff，≤200KB；超過則 ±50 行 context）
4. 讀取 spec（若提供）：brief_spec + dev_spec 的「任務清單+DoD」+「驗收標準」
5. 讀取 CLAUDE.md 中的技術棧資訊和 Coding Style 規範
6. 組裝 context 字串
```

### 並行派出（同一 message 發出所有 Agent）

**後端架構 Agent**：
```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "你是後端架構審查員。從 {detected_backend_stack} 角度分析以下變更：

## 專案技術棧
{tech_stack_from_claude_md}

## 專案規範
{coding_style_and_repo_rules}

## 變更檔案（後端）
{backend_files + diff}

## Spec 對照（若有）
{spec_excerpt 或 '無 spec，純 codebase 分析'}

## 審查重點
1. 依賴注入：新增的 Service/Repository 是否正確註冊與注入？
2. Transaction 邊界：跨 Service 呼叫是否有 TX 安全問題？
3. 分層架構：是否遵循專案的分層模式（Controller→Service→Repository/Model）？
4. Error Handling：是否有 try-catch 但吞掉例外的情況？Log level 是否適當？
5. API 契約：DTO/Response 與 Entity 的映射是否正確？欄位遺漏？

## 輸出格式
每個發現用以下格式：
### XV-BE-{NNN}: {標題}
- **嚴重度**：P0（阻斷）/ P1（重要）/ P2（建議）
- **位置**：`{file}:{line}`
- **描述**：{問題描述}
- **證據**：{程式碼片段或推理}
- **建議修正**：{具體建議}

最後附「## 總結」：P0={n} P1={n} P2={n}，整體評價。",
  description: "XV 後端架構分析"
)
```

**前端一致性 Agent**：
```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "你是前端一致性審查員。從 {detected_frontend_stack} 角度分析以下變更：

## 專案技術棧
{tech_stack_from_claude_md}

## 專案規範
{coding_style_and_repo_rules}

## 變更檔案（前端）
{frontend_files + diff}

## Spec 對照（若有）
{spec_excerpt 或 '無 spec，純 codebase 分析'}

## 審查重點
1. 元件/狀態管理：是否遵循專案的狀態管理 pattern？有無直接在 UI 層做業務邏輯？
2. 設計系統：是否使用專案的 UI 元件庫/設計系統？有無硬編碼樣式值？
3. 網路層：是否使用專案統一的 API Client？有無繞過統一攔截器？
4. State 更新：狀態更新是否正確（immutable / reactive）？有無 side-effect 洩漏？
5. 路由：導航路徑是否正確？

## 輸出格式
每個發現用以下格式：
### XV-FE-{NNN}: {標題}
- **嚴重度**：P0（阻斷）/ P1（重要）/ P2（建議）
- **位置**：`{file}:{line}`
- **描述**：{問題描述}
- **證據**：{程式碼片段或推理}
- **建議修正**：{具體建議}

最後附「## 總結」：P0={n} P1={n} P2={n}，整體評價。",
  description: "XV 前端一致性分析"
)
```

**測試覆蓋 Agent**：
```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "你是測試覆蓋審查員。分析以下變更的測試品質：

## 專案技術棧
{tech_stack_from_claude_md}

## 專案規範
{coding_style_and_repo_rules}

## 變更檔案（全部）
{all_files + diff}

## Spec 對照（若有）
{spec_excerpt 或 '無 spec，純 codebase 分析'}

## 審查重點
1. 覆蓋率：每個新增/修改的 public method 是否有對應測試？
2. Edge Case：Guard clause、null 檢查、boundary values 是否有測試？
3. Mock 正確性：Mock 的 Setup 行為是否反映真實物件行為？有無過度 mock？
4. 測試命名：測試名稱是否清楚描述預期行為？
5. 斷言品質：Assert/Expect 是否檢查了關鍵狀態？有無只 verify 呼叫次數但不驗證參數？

## 輸出格式
每個發現用以下格式：
### XV-TC-{NNN}: {標題}
- **嚴重度**：P0（阻斷，缺少關鍵路徑測試）/ P1（重要，缺少 edge case）/ P2（建議改善）
- **位置**：`{file}:{line}` 或 `{缺少測試的 source file}:{method}`
- **描述**：{問題描述}
- **證據**：{哪個路徑/方法缺測試}
- **建議修正**：{具體測試案例建議}

最後附「## 總結」：P0={n} P1={n} P2={n}，覆蓋率評估（高/中/低）。",
  description: "XV 測試覆蓋分析"
)
```

**安全與效能 Agent**：
```
Task(
  subagent_type: "Explore",
  model: "sonnet",
  prompt: "你是安全與效能審查員。從 OWASP Top 10 和效能角度分析以下變更：

## 專案技術棧
{tech_stack_from_claude_md}

## 變更檔案
{all_source_files + diff}

## 審查重點
1. Injection：有無字串拼接 SQL/NoSQL/command？是否全用 parameterized query？
2. XSS：前端是否有未 sanitize 的 user input 直接渲染？
3. 敏感資料：有無 secret/token/password 在 log 或 response 中洩漏？
4. Race Condition：共享狀態的並發存取是否安全？DB 操作是否有 lost update 風險？
5. N+1 Query：迴圈內是否有 DB 查詢？有無可合併為 batch 的操作？
6. 資源洩漏：連線/檔案/stream 是否正確關閉？async 是否正確 await？

## 輸出格式
每個發現用以下格式：
### XV-SP-{NNN}: {標題}
- **嚴重度**：P0（安全漏洞）/ P1（效能瓶頸）/ P2（改善空間）
- **位置**：`{file}:{line}`
- **描述**：{問題描述}
- **證據**：{程式碼片段或推理}
- **攻擊向量 / 效能影響**：{具體說明}
- **建議修正**：{具體建議}

最後附「## 總結」：P0={n} P1={n} P2={n}，安全等級評估。",
  description: "XV 安全效能分析"
)
```

### 並行降級策略

> 1. **Timeout**：子任務 180 秒無回應 → 標記 timeout
> 2. **Retry**：timeout 或 fail → 重試 1 次（換 model: "opus"）
> 3. **降級路徑**：全部完成 → 正常合併；部分完成 → 只用已完成結果繼續，標記 `⚠️ 部分結果`；全部失敗 → 回退至 Orchestrator 直接分析
> 4. **最低門檻**：至少 2 個視角完成，否則報告標記 `[INCOMPLETE]`

---

## Orchestrator 合成

所有 Agent 回報後，Orchestrator 進行三步合成：

### Step 1：統一清點

將所有 Agent 的發現統一整理，建立完整清單：
```
XV-BE-001 P1 (後端) — 依賴未註冊
XV-FE-001 P0 (前端) — 繞過統一 API Client
XV-TC-001 P1 (測試) — 缺少 guard clause 測試
XV-SP-001 P2 (安全) — Log 中可能洩漏 userId
...
```

### Step 2：交叉比對（Cross-Validation 核心）

這是本 skill 的核心價值。比對不同視角對同一程式碼的看法：

**共識（Consensus）**：多個 Agent 指出相同問題 → 信心提升，嚴重度取最高
```
例：後端 Agent 發現 TX 邊界問題，安全 Agent 也發現 race condition 風險
→ 合併為單一高信心發現
```

**矛盾（Contradiction）**：Agent 之間觀點衝突 → 標記待人工裁定
```
例：後端 Agent 認為 try-catch 正確，測試 Agent 認為應該 let it throw
→ 標記矛盾，兩方觀點並列
```

**盲區（Blind Spot）**：某個 Agent 沒覆蓋到的區域
```
例：新 Service 有後端分析和測試分析，但沒有安全掃描
→ 標記為潛在盲區
```

### Step 3：嚴重度彙整

```
最終嚴重度 = max(各 Agent 給出的嚴重度)
如果 2+ Agent 共識 → 信心標記為「高」
如果僅單一 Agent → 信心標記為「中」
如果有矛盾 → 信心標記為「待裁定」
```

---

## 輸出

### 對話內摘要（必定產出）

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 交叉驗證報告
   分析視角：{啟用的視角數} / 4
   變更範圍：{N} 檔案，{M} 行變更
   Spec 對照：{有/無}

   發現統計：
   🔴 P0: {n}  🟡 P1: {n}  🔵 P2: {n}
   🤝 共識: {n}  ⚡ 矛盾: {n}  🕳️ 盲區: {n}

   {若 P0 > 0: ⛔ 有阻斷性問題，建議立即處理}
   {若 P0 = 0 且 P1 ≤ 2: ✅ 整體品質良好}
   {若矛盾 > 0: ⚠️ 有視角衝突，建議人工裁定}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

接著列出：
1. **P0 阻斷**（若有）— 每項詳述
2. **共識發現**（多視角一致）— 高信心
3. **矛盾發現**（視角衝突）— 雙方觀點並列
4. **P1 重要發現** — 按視角分組
5. **盲區提醒** — 未被覆蓋的區域
6. **P2 建議改善** — 簡要列表

### Markdown 報告（持久化）

寫入 `dev/reviews/xval-{YYYY-MM-DD}-{short-desc}.md`：

```markdown
# 交叉驗證報告

## Meta
- 日期：{date}
- 分支：{branch}
- 變更範圍：{files}
- Spec：{path 或 N/A}
- 視角：{啟用的視角列表}
- 技術棧：{detected stack}

## 發現統計
| 嚴重度 | 數量 | 共識 | 矛盾 |
|--------|------|------|------|
| P0 | {n} | {n} | {n} |
| P1 | {n} | {n} | {n} |
| P2 | {n} | {n} | {n} |

## 共識發現（高信心）
{合併後的發現，附所有 Agent 的證據}

## 矛盾發現（待裁定）
{雙方觀點並列}

## 個別視角發現

### 後端架構
{XV-BE findings}

### 前端一致性
{XV-FE findings}

### 測試覆蓋
{XV-TC findings}

### 安全與效能
{XV-SP findings}

## 盲區分析
{未被充分覆蓋的區域}

## Spec 對照結果（若有）
{DoD/成功標準 逐項核對}
```

---

## 安全規則

- **純讀取**：不修改原始碼、不寫 sdd_context、不觸發 SOP 管線
- **報告寫入**：唯一的寫入是 `dev/reviews/` 下的報告檔案
- **Agent 隔離**：每個 Agent 獨立執行，互不影響
- **誠實原則**：Agent 無法驗證的項目必須標記 ❓，不猜測

---

## 與其他指令的關係

| 需求 | 推薦 |
|------|------|
| 快速看一下能不能做 | `/explore` |
| 驗證某個事實 | `/verify` |
| 對抗式深度審查（R1→R2→R3） | `/code-review` |
| 雙 AI 多輪對話至共識 | `/review-dialogue` |
| **多視角並行分析，合成共識** | **`/cross-validate`**（本指令） |
| SOP 內 Code Review | `/s5-review` |

**選擇原則**：
- 想要「快速多角度體檢」→ `/cross-validate`
- 想要「深入對抗辯論」→ `/review-dialogue`
- 想要「輕量單點確認」→ `/verify`
