---
description: "Audit 收斂迴圈 — 自動循環 spec-audit → fix 直到 P0=P1=P2=0 或達 10 輪上限。觸發：「audit 收斂」「audit converge」「一直審計到沒問題」「自動修到好」「audit loop」"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, mcp__sequential-thinking__sequentialthinking
argument-hint: "<spec 目錄路徑 | latest>"
---

# /audit-converge — 自動審計修復收斂迴圈

> 自動循環 spec-audit（6-Agent 審計）→ fix（Codex/Claude 修復），
> 直到 P0=P1=P2=0 或達 10 輪上限。
> `/spec-converge` 修 Spec 文字；`/audit-converge` 修 Code 實作。

## 環境資訊
- 當前分支: !`git branch --show-current`
- Codex 版本: !`codex --version 2>/dev/null || echo "NOT FOUND"`

## 輸入
- Spec 目錄路徑：$ARGUMENTS
- 若無引數，提示用戶提供 `dev/specs/{folder}/` 路徑
- 若引數為 `latest` → Glob 找最新的 `dev/specs/*/sdd_context.json`

---

## 硬性規則（MUST）

1. **最多 10 輪**。第 10 輪仍未收斂 → 強制停止。
2. **收斂條件**：P0=0 且 P1=0 且 P2=0 → CONVERGED。
3. **停滯偵測**：連續 3 輪 P0+P1+P2 總數無變化 → 提前中斷（STALE）。
4. **審計用 spec-audit 引擎**。遵循 `.claude/commands/spec-audit.md` Phase 1~4 邏輯。
5. **修復用 Codex 優先**。Fallback 用 Claude Task(model: "opus")。
6. **每輪必須顯示狀態面板**。
7. **修復保守**。只修審計指出的問題，不順手「改善」。
8. **不刪除檔案**。只新增或修改。
9. **spec_fix 跳過**。Spec 層問題需人工決策，只修 `code_fix` + `test_fix`。

---

## Phase 0：初始化

```bash
SPEC_FOLDER="$ARGUMENTS"  # e.g., dev/specs/2026-03-01_1_feature-name
SESSION_TS=$(date +%Y%m%d_%H%M%S)
SESSION_DIR="$SPEC_FOLDER/audit-converge/$SESSION_TS"
mkdir -p "$SESSION_DIR"
```

驗證必備檔案存在：
- `{spec_folder}/s0_brief_spec.md`（必須）
- `{spec_folder}/s1_dev_spec.md`（必須）
- `{spec_folder}/sdd_context.json`（必須）
- `{spec_folder}/s1_api_spec.md`（若存在，列入審計）

初始化收斂狀態，寫入 `$SESSION_DIR/convergence-state.json`：

```json
{
  "session_id": "AC-{SESSION_TS}",
  "spec_folder": "{spec_folder}",
  "max_rounds": 10,
  "stale_threshold": 3,
  "rounds": [],
  "final_status": "in_progress"
}
```

顯示啟動面板：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Audit Converge 開始
   Spec: {spec_folder}
   上限: 10 輪
   收斂條件: P0=0 且 P1=0 且 P2=0
   停滯偵測: 連續 3 輪無進展 → 中斷
   Session: {SESSION_DIR}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Phase 1：迴圈（Round N = 1~10）

### 1.1 審計階段

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round {N}/10 — 審計中（6-Agent 引擎）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**執行 spec-audit 引擎**（遵循 `.claude/commands/spec-audit.md`）：

**Round 1**：完整執行 Phase 1~4
1. Phase 1：用 sequential-thinking 解析 Spec → 6 維度審計清單
2. Phase 2：6-Agent 並行調度（6 個 Explore subagent 同時發出）
3. Phase 3：交叉驗證矩陣
4. Phase 4：產出報告

> **Round 2+ 效率優化**：跳過 Phase 1（審計清單不變），直接用 Round 1 的清單重新掃描 codebase。

**Phase 5 持久化**：每輪都執行 spec-audit 的 Phase 5（Persist & Track）。
- 寫入 `{spec_folder}/audit/spec_audit_report.md`（覆蓋）
- 寫入 `{spec_folder}/audit/history/{timestamp}/`（快照）
- Append `sdd_context.json` 的 `audit_history[]`

將審計結果也寫入 `$SESSION_DIR/round-{N}-audit.md`（session 備份）。

從審計結果解析 P0、P1、P2 計數。

### 1.2 收斂檢查

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round {N}/10 — 審計結果
   P0: {n}  P1: {n}  P2: {n}  總計: {total}
   趨勢: {與上一輪比較 ↓↑→}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

記錄到 `convergence-state.json` 的 `rounds[]`：

```json
{
  "round": 1,
  "p0": 3, "p1": 5, "p2": 2, "total": 10,
  "action": "fix",
  "fixed_count": 0,
  "skipped_spec_fix": 0
}
```

**收斂判定**（按優先順序）：

| 條件 | 結果 | 跳轉 |
|------|------|------|
| P0=0 且 P1=0 且 P2=0 | **CONVERGED** | → Phase 2 |
| N = 10 | **MAX_ROUNDS** | → Phase 3 |
| 連續 3 輪 total 相同 | **STALE** | → Phase 3 |
| 否則 | 繼續修復 | → 1.3 |

### 1.3 修復階段

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round {N}/10 — 修復中
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 1.3.1 解析 findings

從審計報告中提取 findings，分類為：
- `code_fix`：需改 code（Controller/Service/Repository/Component 等）
- `test_fix`：缺 test case 或 test 不完整
- `spec_fix`：Spec 本身有問題（**跳過，需人工決策**）

按 P0 → P1 → P2 排序。

#### 1.3.2 修復執行

> 遵循 `.claude/commands/audit-fix.md` Phase 3 邏輯

分批修復，每批最多 5 個相關 gap。先 P0，再 P1，最後 P2。

**修復引擎**（優先 Codex，Fallback Claude）：

```
1. 組裝修復指令到 $SESSION_DIR/round-{N}-fix-batch-{M}.md
2. Codex 修復：
   codex exec -s workspace-write \
     -o "$SESSION_DIR/round-{N}-fix-result-{M}.md" \
     "Read $(pwd)/$SESSION_DIR/round-{N}-fix-batch-{M}.md and fix all issues..."
3. Fallback（Codex 失敗 / exit code != 0 / 超時 180s）：
   Task(model: "opus", prompt: "讀取修復指令並修復...")
```

修復指令格式：
```markdown
# Code Fix Task (Round {N}, Batch {M})

你是本專案的修復工程師。以下是 spec audit 發現的問題，請逐個修復。
專案規則請參照 CLAUDE.md 和 AGENTS.md 中定義的 coding style 和技術棧規範。

## 待修復問題

{每個 gap 的完整資訊}

## 修復原則
- 只修指出的問題，不改其他程式碼
- 新增 test 時放在正確的 test 目錄
- 不刪除檔案
- 修復後確認 import、型別正確
```

#### 1.3.3 記錄修復結果

修復結果寫入 `$SESSION_DIR/round-{N}-fix.md`。

```bash
git diff --stat > "$SESSION_DIR/round-{N}-diff.txt"
```

更新 `convergence-state.json`：
```json
{
  "round": 1,
  "p0": 3, "p1": 5, "p2": 2, "total": 10,
  "action": "fix",
  "fixed_count": 8,
  "skipped_spec_fix": 2
}
```

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round {N}/10 — 修復完成
   修復: {n} 項  |  跳過(spec_fix): {n} 項
   變更檔案: {file_count} 個
   → 進入 Round {N+1}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

回到 1.1，N = N+1。

---

## Phase 2：收斂完成

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CONVERGED — Round {N}/10
   P0: 0  P1: 0  P2: 0
   總輪數: {N}

   收斂歷程:
   Round 1: P0={n} P1={n} P2={n} (total={n}) → 修復 {n} 項
   Round 2: P0={n} P1={n} P2={n} (total={n}) → 修復 {n} 項
   ...
   Round {N}: P0=0 P1=0 P2=0 (total=0) → ✅

   Session: {SESSION_DIR}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

更新 `convergence-state.json`：`"final_status": "converged"`

```bash
git diff > "$SESSION_DIR/final-changes.diff"
git diff --stat > "$SESSION_DIR/final-changes-stat.txt"
```

---

## Phase 3：未收斂停止

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 未收斂 — {MAX_ROUNDS | STALE}
   最終狀態: P0={n} P1={n} P2={n}
   總輪數: {N}

   收斂歷程:
   {每輪 P0/P1/P2 趨勢}

   原因分析:
   - MAX_ROUNDS: 10 輪用盡
   - STALE: 連續 3 輪 total={n} 無變化

   剩餘 P0 問題（若有）:
   {列出最後一輪的 P0 findings}

   剩餘 P1 問題:
   {列出最後一輪的 P1 findings}

   建議:
   - 手動處理 spec_fix 類型問題（{n} 項被跳過）
   - 檢查修復是否引入新問題
   - 考慮拆分 spec 降低複雜度
   - `git diff` 檢視完整變更

   Session: {SESSION_DIR}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

更新 `convergence-state.json`：`"final_status": "max_rounds" | "stale"`

```bash
git diff > "$SESSION_DIR/final-changes.diff"
git diff --stat > "$SESSION_DIR/final-changes-stat.txt"
```

---

## Session 目錄結構

```
{spec_folder}/audit-converge/{SESSION_TS}/
├── convergence-state.json          # 迴圈狀態追蹤（每輪 P0/P1/P2）
├── round-1-audit.md                # Round 1 審計報告
├── round-1-fix.md                  # Round 1 修復結果
├── round-1-fix-batch-1.md          # Round 1 修復指令（Batch 1）
├── round-1-fix-result-1.md         # Round 1 修復回應（Batch 1）
├── round-1-diff.txt                # Round 1 diff --stat
├── round-2-audit.md
├── round-2-fix.md
├── round-2-diff.txt
├── ...
├── final-changes.diff              # 最終完整 diff
└── final-changes-stat.txt          # 最終 diff 統計
```

---

## 與現有 Skill 的關係

| Skill | 層級 | 迴圈 | 差異 |
|-------|------|------|------|
| `/spec-converge` | Spec 文字 | 5 輪 | 修 spec，不改 code |
| `/spec-audit` | Code 審計 | 無 | 只審不修 |
| `/audit-fix` | Code 修復 | 單輪 | 審計 + 修復一次 |
| `/audit-converge` | Code 審計+修復 | **10 輪** | 自動迴圈至收斂 |

**典型使用順序**：
1. `/spec-converge latest` → Spec 文字先收斂
2. `/audit-converge latest` → Code 實作再收斂
3. 全部 P0=P1=P2=0 → 可信心提交

---

## 使用範例

```bash
# 自動審計修復收斂
/audit-converge dev/specs/2026-03-01_1_feature-name

# 對最新 spec 收斂
/audit-converge latest
```
