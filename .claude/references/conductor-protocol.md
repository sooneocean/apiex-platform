# Conductor Protocol — SDD 智慧調度協議

> 本文件定義 Orchestrator（主對話上下文）在 Autopilot 模式下的行為規範。
> 與 `orchestrator-behavior.md` 互補：orchestrator-behavior 定義基礎能力，本文件定義智慧調度層。

## 核心理念

**Conductor = 增強版 Orchestrator**。用戶用自然語言描述需求，Conductor 自動：
1. 分類意圖 → 路由到對應 Skill/Agent
2. 管理 Autopilot 狀態機 → S0 確認後自動推進 S1~S7
3. 監控安全閥 → 異常時中斷並通知用戶

---

## 1. 意圖路由器（Intent Router）

### 分類規則

用戶每次輸入，Conductor 先分類為 4 類之一：

| 分類 | 判斷依據 | 動作 |
|------|---------|------|
| **SOP 任務** | 包含建設性動詞（做/加/改/修/新增/重構/修復） | 啟動 Autopilot S0→S7 |
| **獨立 Skill** | 包含 Skill 關鍵字（見路由表） | 直接調用對應 Skill |
| **直接操作** | 查詢/確認/瀏覽性質 | 直接執行，不觸發 SOP |
| **SOP 控制** | 進度/繼續/暫停/切換模式 | 恢復或控制 SOP 流程 |

### 自然語言 → Skill 路由表

#### SOP 任務（觸發 Autopilot）

| 用戶語句特徵 | 推斷 work_type | 範例 |
|-------------|---------------|------|
| 「新增」「做一個」「加入」「支援」「實作」 | `new_feature` | 「幫我加一個登入功能」 |
| 「壞了」「錯誤」「bug」「不正常」「crash」「修復」 | `bugfix` | 「這個 API 回傳 500」 |
| 「重構」「優化」「整理」「改善」「拆分」「解耦」 | `refactor` | 「重構 auth 模組」 |
| 「調查」「為什麼」「怎麼回事」「查原因」 | `investigation` | 「查一下為什麼 API 變慢」 |
| 「補完」「補齊」「缺少」「漏掉」 | `new_feature`（補完子類） | 「把缺少的驗證邏輯補上」 |

#### 獨立 Skill（直接調用，不觸發 SOP）

| 用戶語句 | 對應 Skill | 說明 |
|---------|-----------|------|
| 「審查 spec」「review spec」 | `/spec-review` | 獨立 Spec 審查 |
| 「審查 code」「review code」「看一下程式碼」 | `/code-review` | 獨立 Code Review |
| 「收斂 spec」「converge」「跟 codex 對齊」 | `/spec-converge` | Spec 迭代收斂 |
| 「audit 收斂」「audit converge」「自動修到好」 | `/audit-converge` | Code 審計收斂（10 輪） |
| 「跟 codex 討論」「dialogue review」「對話審查」 | `/review-dialogue` | 雙 AI 對話審查 |
| 「debug」「錯誤」「失敗了」（非需求描述） | `/debug` | 錯誤診斷 |
| 「探索」「看一下 XXX 怎麼寫的」 | `/explore` | 代碼探索 |
| 「分析 git」「看 branch」 | `/git-analyze` | Git 分析 |
| 「填寫需求」「準備需求文件」 | `/s0-prepare` | 互動式需求填寫 |
| 「並行開發」「parallel」「同時做」「worktree」 | `/parallel-develop` | Git Worktree 並行開發 |
| 「flowchart」「流程圖」「畫流程圖」「flow」 | flowchart skill | 流程圖 HTML 渲染 |
| 「wireframe」「線框圖」「畫面規劃」「UI 草圖」 | wireframe skill | 線框圖 HTML 渲染 |
| 「wireframe-review」「PM review」「給 PM 看」「給設計師看」「UIUX review」 | wireframe-review skill | PM/UIUX Review 版線框圖 |
| 「wireframe-interactive」「互動原型」「可互動」「interactive」「UX 原型」「可點擊」 | wireframe-interactive skill | 互動式 UX 原型 |

#### 直接操作（不觸發任何 SOP/Skill）

| 用戶語句 | 行為 |
|---------|------|
| 「查一下」「看一下」（無建設性動詞） | 直接 Read/Grep/Glob |
| 「跑一下測試」「確認 build」 | 直接 Bash 執行 |
| 「你好」「幫助」 | 直接回應 |

#### SOP 控制

| 用戶語句 | 行為 |
|---------|------|
| 「進度?」「現在到哪了」 | SDD Context 恢復掃描 |
| 「繼續」「OK」「確認」 | 確認 Gate 放行 |
| 「不要 autopilot」「手動模式」 | 切換為 Semi-Auto |
| 「暫停」「停」「等一下」 | 暫停 Autopilot |
| 「取消」 | 取消當前 SOP |

### 分類衝突解決

| 衝突情境 | 解決方式 |
|---------|---------|
| 「查一下為什麼 API 壞了」→ 直接操作 or SOP? | 有具體問題方向 + 建設性意圖 → SOP（investigation）；無具體方向 → 直接操作 |
| 「重構一下這個函數」→ SOP or 直接改? | 單函數 rename/extract → 直接操作；跨模組重構 → SOP |
| 混合信號 | 主動詢問用戶：「你想要我直接處理，還是走完整 SOP？」 |

---

## 2. 執行模式（Execution Mode）

### 模式定義

| 模式 | 說明 | Gate 行為 |
|------|------|----------|
| **Autopilot**（預設） | S0 確認後全自動 S1~S7 | 見狀態機 |
| **Semi-Auto** | 傳統模式，多道 Gate | S0🔴 S3🔴 S5🟡 S7🟡 |
| **Manual** | 每階段手動觸發 | 全部🔴 |

### 模式切換

- 預設：**Autopilot**
- 「不要 autopilot」「手動模式」→ Semi-Auto
- 「全手動」→ Manual
- 「autopilot」「自動模式」→ Autopilot
- 切換時更新 `sdd_context.execution_mode`

### sdd_context 欄位

```json
{
  "sdd_context": {
    "execution_mode": "autopilot | semi-auto | manual"
  }
}
```

> S0 建立 sdd_context 時，根據當前模式設定此欄位。後續 Skill/Gate 讀取此欄位決定行為。

---

## 3. Autopilot 狀態機

### 轉換圖

```
IDLE ──用戶描述需求──→ S0
S0 ──🔴人工確認────→ [前端偵測] ──有UI──→ flowchart skill ──→ wireframe skill ──→ S1
                                  └─無UI──→ S1 (auto-chain)
S1 ──🟢自動────────→ S2 (Quick:跳過)
S2 ──🟢自動────────→ S3
S3 ──📋摘要通知────→ S4 (auto-continue)
S4 ──🟢自動────────→ S5
S5 ──┬─ pass ──────→ S6
     ├─ P1 ────────→ S4 (repair loop ≤3)
     └─ P0 ────────→ ⚠️ INTERRUPT
S6 ──┬─ pass ──────→ AC (audit-converge)
     └─ fail ──────→ repair → S6 (≤3)
AC ──┬─ converged ─→ S7
     └─ not ───────→ ⚠️ INTERRUPT
S7 ──auto commit───→ ✅ DONE
```

### Gate 策略對照

| 轉換 | Autopilot | Semi-Auto | Manual |
|------|-----------|-----------|--------|
| →S0 | 🟢 自動 | 🟢 自動 | 🟢 自動 |
| S0→S1 | 🔴 **必停** | 🔴 **必停** | 🔴 必停 |
| S0→FC→WF→S1 | 🟢 自動偵測 | 🟢 自動偵測 | 🟢 自動偵測 |
| S1→S2 | 🟢 自動 | 🟢 自動 | 🔴 必停 |
| S2→S3 | 🟢 自動 | 🟢 自動 | 🔴 必停 |
| S3→S4 | 📋 摘要通知 | 🔴 **必停** | 🔴 必停 |
| S4→S5 | 🟢 自動 | 🟢 自動 | 🔴 必停 |
| S5→S6 | 🟢 自動 | 🟡 確認 | 🔴 必停 |
| S6→AC | 🟢 自動 | 🟢 自動 | 🔴 必停 |
| AC→S7 | 🟢 自動（收斂時） | 🟡 確認 | 🔴 必停 |
| S7 完成 | 🟢 auto commit | 🟡 確認 | 🔴 必停 |

### S0→S1 前端偵測（Wireframe Auto-Trigger）

> **強制規則**：S0 確認後、進入 S1 之前，**必須**執行前端偵測。這不是可選步驟。

**偵測流程**：

1. 讀取 `s0_brief_spec.md` 全文
2. 掃描以下關鍵字池（不區分大小寫）：
   `畫面`、`頁面`、`screen`、`UI`、`表單`、`form`、`列表`、`list`、`Dashboard`、
   `按鈕`、`button`、`導航`、`nav`、`modal`、`dialog`、`tab`、`卡片`、`card`、
   `輸入`、`input`、`前端`、`frontend`、`web`、`app`、`mobile`、`RWD`、`responsive`、
   `sidebar`、`SwiftUI`、`Flutter`、`React`、`Vue`、`頁`、`介面`、`Client`
3. 命中 ≥ 2 個不同關鍵字 → **自動觸發前端設計管線**
4. 命中 < 2 → 跳過，直接進 S1

**觸發時**：
- 調用 flowchart skill（Pipeline 模式，自動讀取 brief spec §4 Mermaid 區塊 → 產出 `frontend/flowchart.html`）
- flowchart 完成後自動調用 wireframe skill（Pipeline 模式，讀取 brief spec §8 + `flowchart.html` → 產出 `frontend/wireframe.html`）
- wireframe 完成後自動接續進入 S1
- 用戶不需額外操作

**跳過時**：
- 直接進入 S1（auto-chain）

### Auto-Chain 協議

Orchestrator 在每個 Skill 完成後執行：

```
1. 讀取 sdd_context.json
2. 檢查 execution_mode
3. 若 autopilot:
   a. 讀取 current_stage 和最新 stage 的 status
   b. 判斷下一階段（依狀態機）
   c. 特殊處理：
      - S0 確認 → 執行「S0→S1 前端偵測」（見上方段落）→ 命中時依序：flowchart → wireframe → S1
      - S3 完成 → 顯示摘要（波次數、任務數、估計複雜度）→ 自動繼續
      - S5 P1 → 檢查 repair_loop_count < 3 → 自動回 S4
      - S5 P0 → ⚠️ INTERRUPT
      - S6 fail → 檢查修復次數 < 3 → 自動修復+重測
      - S6 pass → 自動調用 audit-converge（spec_folder 從 sdd_context 取得）
      - AC converged → 繼續 S7
      - AC not converged → ⚠️ INTERRUPT
   d. 調用下一個 Skill，傳入 sdd_context JSON
4. 若 semi-auto:
   a. 依 orchestrator-behavior.md Gate 策略
5. 若 manual:
   a. 每階段停下等用戶指令
```

### S3 摘要通知格式

Autopilot 模式下 S3 完成時，顯示：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 S3 執行計畫 — 自動繼續
   波次: {N} waves  任務: {N} tasks
   預估複雜度: {low/medium/high}
   模式: {Quick / Full Spec}
   → 開始 S4 實作...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### S7 完成通知格式

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ SOP 完成 — {feature_name}
   Commit: {hash} ({branch})
   變更: {N} files (+{added} -{deleted})
   耗時: S0~S7 全程

   📊 摘要:
   - S1: {impact_scope 概述}
   - S4: {tasks_completed}/{total_tasks} 任務
   - S5: {conclusion}（{score}）
   - S6: {test_result}

   💡 下一步:
   - 建立 PR: gh pr create
   - 更新 Issue 狀態
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 4. 安全中斷（Safety Interrupts）

### 強制中斷條件

即使 Autopilot 模式，以下情況**強制停下通知用戶**：

| 條件 | 中斷層級 | 行為 |
|------|---------|------|
| S5 出現 P0 | 🔴 **阻斷** | 通知用戶，需人工裁決是否回 S1 |
| S4↔S5 迴圈 3 次 | 🔴 **阻斷** | 通知用戶，建議手動介入 |
| S6 修復迴圈 3 次 | 🔴 **阻斷** | 通知用戶，列出未通過測試 |
| Audit Converge 未收斂 | 🔴 **阻斷** | 通知用戶，列出剩餘 P0/P1/P2 |
| Agent 崩潰/超時 | 🟡 **警告** | 嘗試降級處理，失敗則通知 |
| 用戶說「停/暫停/等一下」 | 🔴 **立即** | 暫停 Autopilot，等待指令 |
| SDD Context 損壞/不可讀 | 🔴 **阻斷** | 通知用戶，建議恢復或重建 |

### 中斷通知格式

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Autopilot 中斷 — {原因}
   當前階段: {current_stage}
   問題: {描述}

   選項:
   - 「繼續」→ 忽略問題繼續（不建議）
   - 「修改: ...」→ 提供修改方向
   - 「取消」→ 結束 SOP
   - 「不要 autopilot」→ 切換為手動模式
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 暫停與恢復

- **暫停**：設定 `sdd_context.autopilot_paused: true`
- **恢復**：用戶說「繼續」→ 從 `current_stage` 繼續 auto-chain
- **切換**：「不要 autopilot」→ `execution_mode: "semi-auto"`，後續 Gate 恢復傳統行為

---

## 5. Context 壓縮策略（Autopilot 增強）

Autopilot 長程運行容易撐滿 context。Conductor 主動管理壓縮：

| 階段結束 | 壓縮策略 |
|---------|---------|
| S1 完成 | 🔴 **強制建議** `/compact`（explorer 大量 Read/Grep） |
| S3 完成 | 🟡 建議（如果 S1+S2+S3 累積量大） |
| S4 完成 | 🔴 **強制建議** `/compact`（實作階段 tool call 密集） |
| S6 完成 | 🟡 建議（測試輸出量視 TC 數） |

> Autopilot 模式下 compact 後自動恢復（`sop-compact-reminder.sh` + SDD Context recovery）。

---

## 6. 與現有系統的關係

| 元件 | 現有 | Conductor Protocol 增強 |
|------|------|----------------------|
| `orchestrator-behavior.md` | 基礎職責、Gate 控制、恢復機制 | 新增 Autopilot auto-chain 引用 |
| `sop-rules-detail.md` | Gate 策略表、觸發規則 | 新增 Autopilot Gate 策略列 |
| `CLAUDE.md` | 自動觸發規則、Agent 表 | 預設 Autopilot、路由規則增強 |
| `sdd-context-schema.md` | JSON schema | 新增 `execution_mode` 欄位 |
| 各 Skill Gate 區段 | 🔴/🟡 Gate 行為 | 讀取 `execution_mode` 調整行為 |

---

## 7. Hook Profile System（v3.0.0）

### 三層 Profile

| Profile | 說明 | 活躍 Hook |
|---------|------|----------|
| **minimal** | 核心安全閥 only | protect-files, validate-sdd-context, context-guard, sop-compact-reminder, generate-manifest |
| **standard**（預設） | 全部 hook | 上述 + quality-gate, cost-tracker, instinct-observer, strategic-compact |
| **full** | standard + 額外安全掃描 | 同 standard（預留未來擴充 config-tamper-detection 等） |

### 控制方式

- `CHILLVIBE_HOOK_PROFILE=minimal` — 環境變數設定 profile
- `CHILLVIBE_DISABLED_HOOKS=instinct-observer,cost-tracker` — 逗號分隔停用個別 hook
- 每個 hook 開頭 source `lib/hook-profile.sh` 並呼叫 `check_hook "hook-id"`

### 使用場景

| 場景 | 建議 Profile |
|------|-------------|
| 正常開發 | standard |
| CI/CD 環境 | minimal（無 interactive） |
| 成本敏感 | standard + `CHILLVIBE_DISABLED_HOOKS=instinct-observer` |
| 嚴格審計 | full |

---

## 8. Cost Awareness（v3.0.0）

### 成本追蹤

- `cost-tracker.sh`（Stop hook）：每次 Claude 回應後記錄 JSONL 到 `~/.claude/metrics/costs.jsonl`
- 每筆記錄含：timestamp, session_id, model, input_tokens, output_tokens, cost_usd
- S7 完成時，Conductor 彙整 session 成本寫入 `sdd_context.pipeline_cost`

### 警告閾值

| 層級 | 預設閾值 | 行為 |
|------|---------|------|
| Notice | $2 | 提醒注意成本 |
| Warning | $5 | 建議控制操作規模 |
| Critical | $10 | 建議切換 sonnet 或縮小範圍 |

閾值可在 CLAUDE.md 中設定：`cost_alert_thresholds: [2, 5, 10]`

### S7 Pipeline Cost 寫入

```json
{
  "pipeline_cost": {
    "total_usd": 12.50,
    "by_model": { "opus": 10.00, "sonnet": 2.00, "haiku": 0.50 },
    "by_stage": { "s0": 0.50, "s1": 3.00, "s2": 1.00, "s3": 0.50, "s4": 4.00, "s5": 2.00, "s6": 1.00, "s7": 0.50 },
    "session_count": 3
  }
}
```

### S7 完成通知格式（擴充）

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ SOP 完成 — {feature_name}
   Commit: {hash} ({branch})
   變更: {N} files (+{added} -{deleted})
   成本: ${total_usd}（opus: ${opus}, sonnet: ${sonnet}, haiku: ${haiku}）
   Sessions: {session_count}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 9. Instinct Learning（v3.0.0）

### 觀察-提取-提升生命週期

```
PostToolUse (100%)
    │
    ▼
tool-log.jsonl（同步寫入，快速）
    │
    ▼  每 25 calls
Haiku subagent（背景提取）
    │
    ▼
instincts.jsonl（專案域，by git remote hash）
    │
    ▼  同一 instinct 在 2+ 專案 + confidence ≥ 0.8
global/instincts.jsonl（跨專案提升）
```

### 專案隔離

- 每個專案以 `git remote origin URL` 的 MD5 hash 為 scope
- 路徑：`~/.claude/instincts/{hash}/`
- 全域：`~/.claude/instincts/global/`

### Instinct 格式

```json
{"id":"INS-001","pattern":"description","confidence":0.7,"category":"code|test|debug|refactor|explore"}
```

### 與 SDD Context 整合

- S7 完成時，Conductor 從 `instincts.jsonl` 提取本次 SOP 期間的 instinct → 寫入 `sdd_context.instincts_extracted[]`
- `lessons_learned.instincts_summary` 自動彙整

---

## 10. Strategic Compact（v3.0.0）

### 計數式壓縮建議

- `strategic-compact.sh`（PreToolUse hook）：每 session 追蹤 tool call 計數
- 每 50 次建議一次 `/compact`（避免 auto-compact 在不利時機觸發）
- 與 `context-guard.sh`（size-based）互補

### SOP 最佳壓縮點

| 時機 | 理由 |
|------|------|
| S1 完成 | codebase-explorer 大量 Read/Grep |
| S4 完成 | 實作階段 tool call 密集 |
| S5 P1 → S4 迴圈前 | 清除審查對話，保留 blocking_fixes |

### 壓縮後保留 vs 消失

| 保留 | 消失 |
|------|------|
| CLAUDE.md 全文 | 推理過程 |
| sdd_context.json（透過 sop-compact-reminder 恢復） | 對話歷史 |
| Git 狀態 | Tool call 記錄 |
| TodoWrite 任務 | 中間探索結果 |

---

## 11. Quality Gate（v3.0.0）

### 寫入後自動 Lint

- `quality-gate.sh`（PostToolUse on Edit|Write）：偵測 linter → auto-format → 報告
- 偵測優先級：CLAUDE.md 聲明 > config-file 自動偵測

### 偵測矩陣

| Config File | Linter | Command |
|-------------|--------|---------|
| biome.json | Biome | `npx biome check --fix` |
| .prettierrc | Prettier | `npx prettier --write` |
| .eslintrc / eslint.config.* | ESLint | `npx eslint --fix` |
| pyproject.toml[tool.ruff] / .ruff.toml | Ruff | `ruff check --fix` |
| go.mod | gofmt | `gofmt -w` |

### 與 S5 的分工

| 層 | 職責 |
|----|------|
| Quality Gate hook | 格式、語法、import 排序（自動修復） |
| S5 Code Review | 邏輯、架構、安全、效能（人/AI 審查） |

### Config Tamper Protection

`protect-files.sh` v3.0.0 三層保護：
1. `.env` / `.env.*` — 永遠阻擋（硬編碼）
2. Quality-gate 偵測到的 linter config — 自動阻擋
3. CLAUDE.md `protected_files: [...]` — 用戶聲明阻擋

---

## 12. External Plugin 共存（Superpowers）

| 情境 | 意圖路由優先權 | Superpowers Skill 檢查 |
|------|--------------|----------------------|
| SOP 管線活躍 | **Conductor Protocol** | 抑制 |
| SOP 管線非活躍 | Conductor 優先 → superpowers fallback | 允許 |
| 直接操作模式 | 無 SOP 路由 | 允許 |

**原因**：SOP 管線的調度決策是 Spec-driven 且確定性的，不應被 plugin 層級的泛用 "check skills" 指令干擾。

---

## 13. Failed Approaches Tracking（v3.0.0）

### 雙層記錄

| 層級 | 位置 | 記錄什麼 |
|------|------|---------|
| 頂層 | `sdd_context.failed_approaches[]` | 架構級失敗（方案選擇錯誤、技術棧不適合等） |
| Stage-level | `s1/s4/s5/s6.output.failed_approaches[]` | 技術級失敗（具體實作方案不可行） |

### 格式

```json
{
  "approach": "嘗試使用 Redis 做 session 管理",
  "reason": "部署環境不支援 Redis，且增加基礎設施複雜度",
  "timestamp": "2026-03-12T10:30:00Z"
}
```

頂層格式多一個 `"stage": "S4"` 欄位標記來源階段。

### 寫入時機

| 時機 | 誰寫 | 寫到哪 |
|------|------|--------|
| S1 方案比較後棄選方案 | architect | s1.output.failed_approaches |
| S4 實作失敗回退 | 執行 agent | s4.output.failed_approaches |
| S5 redesign_required | reviewer | s5.output.failed_approaches + 頂層 |
| S6 修復失敗 | test-engineer | s6.output.failed_approaches |
| S4↔S5 安全閥觸發 | Conductor | 頂層 |

### 恢復時顯示

`sop-compact-reminder.sh` 恢復 SOP 時，若存在 `failed_approaches`，顯示：

```
⚠️ 已知失敗路徑（避免重蹈覆轍）：
  - [S4] 嘗試 Redis session → 部署環境不支援
  - [S5] 直接修改 legacy API → 破壞下游相容性
```
