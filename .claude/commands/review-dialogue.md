---
description: "雙 AI 對話式審查 — Claude 與 Codex 互審，直到共識。支援 spec/code/test 三種類別。觸發：「對話審查」、「dialogue review」、「跟 codex 討論 spec」"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task
argument-hint: "<spec 目錄路徑 | latest> [spec|code|test] [resume]"
---

# /review-dialogue — 雙 AI 對話式審查

> Claude 提交 → Codex 審查 → Claude 驗證/防禦/修正 → Codex 回應 → 迭代至共識。
> Codex 側使用 `$skill-review-sync` (mode=dialogue)。
> Session 目錄規則見 `.claude/references/review-protocol.md`

## 環境資訊
- 當前分支: !`git branch --show-current`
- Codex 版本: !`codex --version 2>/dev/null || echo "NOT FOUND"`

## 輸入
目標：$ARGUMENTS

---

## Dialogue 類別（Scope）

| Scope | SOP 階段 | 審查對象 | 修正對象 | Codex mode |
|-------|---------|---------|---------|------------|
| `spec` | S2 | dev_spec + brief_spec | s1_dev_spec.md | `dialogue` |
| `code` | S5 | git diff + changed files + DoD | 原始碼 | `dialogue` |
| `test` | S6 | 測試結果 + 失敗 log + 驗收標準 | 原始碼 + 測試碼 | `dialogue` |

### Scope 解析優先序

1. 明確指定 `scope`（非 `auto`）→ 使用指定值
2. 既有 `dialogue-state.json` 存在且含有效 `scope` → 使用儲存值（續輪優先）
3. 從 `sdd_context.json` 推導：
   - `current_stage == "S2"` 或 `stages.s2.status in [pending, in_progress]` → `spec`
   - `current_stage == "S5"` 或 `stages.s5.status in [pending, in_progress, fix_required]` → `code`
   - `current_stage == "S6"` 或 `stages.s6.status in [pending, in_progress]` → `test`
4. 無法判定 → fail-fast，要求顯式 scope

---

## 硬性規則（MUST）

1. **最多 20 輪**（可由 dialogue-state.json 的 max_turns 覆蓋）。
2. **收斂條件**：`spec` 依注入 Output Schema；`code` P0=P1=0 即通過（P2 容忍）；`test` 零容忍（P0=P1=P2=0）。
3. **禁止跳過 Codex**。每輪審查必經 Codex CLI，不可自審。
4. **獨立驗證**。收到 Codex findings 後必須自行 grep/read 驗證，不可盲目接受。
5. **防禦需有依據**。defend 必須附 counter-evidence（file:line 或 spec 段落）。
6. **修正必須保守**。只修 Codex 指出的問題，不順手「改善」其他部分。
7. **Bounded Read**。不讀全部歷史 turns，遵循 dialogue-index.json 索引策略。
8. **每個新 finding 需有 evidence**。無 evidence 的 finding 視為無效。Finding ID 格式：`SR-` (spec)、`CR-` (code)、`TR-` (test)。
9. **Test scope 重跑測試**。test 類別修正後必須重跑相關測試，附上結果。

---

## 流程

### 0. 初始化

#### 解析參數

```
/review-dialogue <target> [scope] [resume]
```

- `target`：`latest` 或 spec 目錄路徑
- `scope`：`spec | code | test`（可選，未指定則自動偵測）
- `resume`：恢復既有 dialogue

範例：
- `/review-dialogue latest` → 自動偵測 scope
- `/review-dialogue latest code` → 明確 code dialogue
- `/review-dialogue dev/specs/xxx/ test resume` → 恢復 test dialogue

#### 目錄設定

```bash
DIALOGUE_DIR="$SPEC_FOLDER/review/dialogue"
mkdir -p "$DIALOGUE_DIR"
```

#### 檢查既有 dialogue state

讀取 `$DIALOGUE_DIR/dialogue-state.json`：
- **存在且 status=in_progress** → 詢問：「偵測到進行中的 {scope} dialogue（Turn {N}），是否繼續？」
  - 是 → 跳到步驟 2（讀取最新 Codex turn）
  - 否 → 清除 dialogue/ 下所有檔案，重新開始
- **存在且 status=approved** → 告知已完成，詢問是否重新開始
- **不存在** → 新 dialogue，進入步驟 1

---

### 1. Claude Submit（Turn 1）

#### Context Assembly — 依 Scope 分支

##### Scope: `spec`

| 來源 | 檔案 | 必要性 |
|------|------|--------|
| Review Standards | `.claude/references/review-standards.md` | 必要 |
| Output Schema | `.claude/references/review-output-schema.md` | 必要 |
| Dev Spec | `{spec_folder}/s1_dev_spec.md` | 必要 |
| Brief Spec | `{spec_folder}/s0_brief_spec.md` | 建議 |
| Implementation Plan | `{spec_folder}/s3_implementation_plan.md` | 可選 |

##### Scope: `code`

| 來源 | 檔案/指令 | 必要性 |
|------|----------|--------|
| Review Standards | `.claude/references/review-standards.md` | 必要 |
| Output Schema | `.claude/references/review-output-schema.md` | 必要 |
| Changed Files | `sdd_context.stages.s4.output.changes`（added + modified） | 必要 |
| Git Diff | `git diff main -- $CHANGED_FILES` | 必要 |
| Source Files | 完整內容（每檔 ≤500 行，超過只含 diff ±50 行 context） | 必要 |
| Task DoD | `sdd_context.stages.s1.output.tasks[].dod` | 必要 |
| API Spec | `{spec_folder}/s1_api_spec.md`（若存在） | 建議 |
| Dev Spec | `{spec_folder}/s1_dev_spec.md`（精簡：任務+DoD+驗收標準） | 建議 |

大小控制：Diff >200KB → ±50 行 context。總計 ≤300KB。

##### Scope: `test`

| 來源 | 檔案/指令 | 必要性 |
|------|----------|--------|
| Review Standards | `.claude/references/review-standards.md` | 必要 |
| Output Schema | `.claude/references/review-output-schema.md` | 必要 |
| Test Results | 執行專案測試指令（依 CLAUDE.md `{{BUILD_TEST_COMMANDS}}` 定義） | 必要 |
| Failing Test Files | 失敗 test 的完整原始碼 | 必要 |
| Failing Source Files | 被測試對象的原始碼 | 必要 |
| Acceptance Criteria | `sdd_context.stages.s0.output.success_criteria` | 必要 |
| Task DoD | `sdd_context.stages.s1.output.tasks[].dod` | 建議 |
| E2E Results | E2E API 測試結果（若已執行） | 可選 |

> 若 review-standards 或 output-schema 不存在 → fail-fast，不 silent fallback。

#### 寫入 Submit Turn

寫入 `$DIALOGUE_DIR/turn-001-claude-submit.md`：

```markdown
---
turn: 1
actor: claude
type: submit
scope: {spec|code|test}
timestamp: {iso8601}
references_turn: null
---

# Review Submission ({scope})

## Review Target
{依 scope 不同：spec 路徑 / changed files list / test results summary}

## Review Standards
{review-standards.md 完整內容}

## Output Format
{review-output-schema.md 完整內容}

## Context
{依 scope 組裝的完整內容}
```

#### 初始化 State Files

寫入 `$DIALOGUE_DIR/dialogue-state.json`：
```json
{
  "session_id": "{uuid}",
  "target": "{spec_folder}",
  "scope": "{spec|code|test}",
  "current_turn": 1,
  "max_turns": 20,
  "status": "in_progress",
  "score": { "p0": 0, "p1": 0, "p2": 0, "resolved": 0, "defended_accepted": 0, "defended_rejected": 0 },
  "history": [
    { "turn": 1, "actor": "claude", "type": "submit", "p0": 0, "p1": 0, "p2": 0 }
  ]
}
```

寫入 `$DIALOGUE_DIR/dialogue-index.json`：
```json
{
  "session_id": "{同上}",
  "scope": "{spec|code|test}",
  "unresolved": [],
  "turns_summary": [
    { "turn": 1, "actor": "claude", "type": "submit", "summary": "Initial {scope} submission for review" }
  ]
}
```

#### 呼叫 Codex（透過 codex-liaison Agent）

```
Task(
  subagent_type: "codex-liaison",
  model: "sonnet",
  prompt: "執行 Codex Dialogue Review Turn 2：\n\n
場景：dialogue\n
scope: $SCOPE\n
sandbox_mode: workspace-write\n
output_path: $DIALOGUE_DIR/turn-002-codex-review.md\n
dialogue_dir: $DIALOGUE_DIR\n
spec_folder: $SPEC_FOLDER\n\n
Codex prompt: Use \$skill-review-sync with target=$SPEC_FOLDER, mode=dialogue, scope=$SCOPE, writeback=patch. Read the dialogue context at $DIALOGUE_DIR/ and produce your review turn. Write review_meta.json to $SPEC_FOLDER/review/review_meta.json.\n\n
完成後回傳結構化 JSON（type=codex-dialogue）。若 Codex 失敗則執行 Fallback 審查。",
  description: "Codex Dialogue Turn 2"
)
```

> **並行優勢**：codex-liaison 可與其他 Agent（如 codebase-explorer 預審）在同一 message 並行調度。
> **Fallback**：codex-liaison 內建 Fallback 邏輯，Codex 失敗時自動降級執行替代審查。

---

### 2. 讀取 Codex Review Turn

讀取最新 Codex turn（`turn-{NNN}-codex-review.md`）。

解析每個 finding：
- ID、severity（P0/P1/P2）
- description
- evidence（file:line 或 spec section）
- status（new / confirmed_fixed / defense_accepted / defense_rejected_with_evidence）

解析 summary：
- totals: P0=N, P1=N, P2=N
- decision: CONTINUE | APPROVED

顯示狀態面板：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Turn {N} — Codex 審查結果 ({scope})
   P0: {n}  P1: {n}  P2: {n}
   新 findings: {n}  已解決: {n}
   防禦接受: {n}  防禦駁回: {n}
   Decision: {CONTINUE | APPROVED}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 3. 收斂檢查

- **APPROVED**（或依 output schema 判定通過）→ 跳到步驟 6（完成）
- **CONTINUE 且未超過 max_turns** → 繼續步驟 4
- **超過 max_turns** → 跳到步驟 7（強制停止）
- **Deadlock 偵測**：同一 finding 連續 2+ 輪 defended→rejected → 標記 deadlocked，跳到步驟 8

---

### 4. Claude 驗證 + 回應

**對每個 finding 獨立驗證**：

1. **Grep/Read 實際檔案**，確認 finding 描述的問題是否存在
2. 判定：
   - **問題確實存在** → `accept_and_fix`
   - **問題不存在或已解決** → `defend`：附 counter-evidence（file:line + 實際內容）
   - **部分正確** → accept 有效部分，defend 無效部分

#### 修正動作 — 依 Scope 分支

| Scope | accept_and_fix 動作 | 修正後額外步驟 |
|-------|---------------------|---------------|
| `spec` | 修正 `s1_dev_spec.md` | 無 |
| `code` | 修正原始碼（Edit 工具） | 靜態分析/建置驗證 |
| `test` | 修正原始碼/測試碼 | **重跑失敗測試**，附上結果 |

##### Test Scope 重跑規則

修正後必須重跑相關測試並在 response turn 附上結果。
若重跑仍失敗 → 在 response 中標記 `fix_attempted_but_still_failing`，附上新的失敗 log。

#### 寫入 Response Turn

寫入 `$DIALOGUE_DIR/turn-{N}-claude-response.md`：

```markdown
---
turn: {N}
actor: claude
type: response
scope: {spec|code|test}
timestamp: {iso8601}
references_turn: {上一個 codex turn number}
---

# Response to Turn {codex_turn} ({scope})

## Finding Responses

### {finding_id}: {title}
- **Action**: accept_and_fix | defend
- **Verification**: {驗證過程和結果}
- **Fix Applied** (if accept): {修正描述}
- **Build/Test Result** (if code/test): {靜態分析或測試重跑結果}
- **Counter-Evidence** (if defend): {file:line + 實際內容}
- **Conclusion**: {為什麼接受/防禦}

## Summary
- Accepted & Fixed: {n}
- Defended: {n}
- Fix Attempted Still Failing: {n} (test scope only)
- Total findings addressed: {n}
```

---

### 5. 更新 State + Index → 呼叫 Codex

更新 `dialogue-state.json`：
- `current_turn` +1
- `history` 追加本輪
- `score` 更新

更新 `dialogue-index.json`：
- `unresolved`：移除已修正/防禦接受的，保留未解決的
- `turns_summary` 追加本輪摘要

呼叫 Codex 下一輪（透過 codex-liaison Agent）：

```
Task(
  subagent_type: "codex-liaison",
  model: "sonnet",
  prompt: "執行 Codex Dialogue Review Turn {N+1}：\n\n
場景：dialogue\n
scope: $SCOPE\n
sandbox_mode: workspace-write\n
output_path: $DIALOGUE_DIR/turn-{N+1}-codex-review.md\n
dialogue_dir: $DIALOGUE_DIR\n
spec_folder: $SPEC_FOLDER\n\n
Codex prompt: Use \$skill-review-sync with target=$SPEC_FOLDER, mode=dialogue, scope=$SCOPE, writeback=patch. Read the dialogue context at $DIALOGUE_DIR/ and produce your next review turn. Focus on: latest Claude response (turn-{N}), dialogue-index.json unresolved items, and last 4 turns. Update review_meta.json at $SPEC_FOLDER/review/review_meta.json.\n\n
更新 dialogue-state.json 和 dialogue-index.json。\n
完成後回傳結構化 JSON（type=codex-dialogue）。",
  description: "Codex Dialogue Turn {N+1}"
)
```

回到步驟 2。

---

### 6. 收斂完成

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ APPROVED — {scope} Dialogue 收斂
   P0: 0  P1: 0  P2: 0
   總 Turns: {N}
   Session: {session_id}

   統計:
   - 修正: {n} 項
   - 防禦成功: {n} 項
   - 防禦駁回: {n} 項
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

更新 `dialogue-state.json`：`status = "approved"`
讀取 Codex 的 `review_meta.json` 確認一致。

#### Scope 特化收斂後動作

| Scope | 收斂後動作 |
|-------|-----------|
| `spec` | 無額外動作 |
| `code` | 最終全量靜態分析/建置驗證 |
| `test` | 最終全量測試確認全過 |

---

### 7. 未收斂強制停止

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Max Turns Reached — {max_turns} 輪用盡
   Scope: {scope}
   最終狀態: P0={n} P1={n} P2={n}

   未解決 findings:
   - {finding_id}: {description}
   ...

   建議：
   - 檢查 dialogue-index.json 找出反覆爭議的項目
   - 考慮手動裁定剩餘 issue
   - 或調高 max_turns 繼續
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

更新 `dialogue-state.json`：`status = "max_turns_reached"`

### 8. Deadlock 處理

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 Deadlocked — 發現無法收斂的分歧

   Deadlocked findings:
   - {finding_id}: Claude 連續 2+ 輪防禦被駁回
   ...

   建議：
   - 由用戶裁定這些分歧項目
   - 裁定後可用 resume 繼續
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

更新 `dialogue-state.json`：`status = "deadlocked"`

---

## Bounded Read 策略

每輪處理 Codex 回應時，讀取順序：
1. **最新 Codex turn**（必讀）
2. **`dialogue-index.json`** 的 `unresolved` 摘要（必讀）
3. **最近 4 輪 turns**（補充 context）
4. **更早的 turns**（僅在需要 evidence 驗證時才回讀）

---

## 監控 Log

> 由 `codex-liaison` Agent 負責寫入 `dev/logs/codex-review.jsonl`，Skill 不需自行處理。
> 格式：`{"timestamp":..., "type":"review-dialogue", "scope":..., "turn":..., "engine":"codex|fallback", ...}`

---

## 與現有 Skill 的關係

| Skill | 用途 | 差異 |
|-------|------|------|
| `/spec-review` | 單次 Spec 審查（R1/R2/R3） | 單向，不互動 |
| `/spec-converge` | 迭代收斂（Codex 審→Claude 改） | 單向修正，無防禦機制 |
| `/code-review` | 單次 Code Review（R1/R2/R3） | 單向，不互動 |
| `/s5-review` | SOP S5 Code Review | 管線內，含 Spec 對照驗證 |
| `/s6-test` | SOP S6 測試與驗收 | 管線內，test-engineer 主導 |
| **`/review-dialogue`** | **雙向對話審查** | 三類別，可防禦、可辯論、有共識機制 |

### SOP 管線銜接

| SOP 階段 | 傳統做法 | 對話選項 |
|---------|---------|---------|
| S2 Spec Review | R1→R2→R3 | `/review-dialogue latest spec` |
| S5 Code Review | `/code-review s5` | `/review-dialogue latest code` |
| S6 Testing | test-engineer 閉環 | `/review-dialogue latest test` |

兩種做法**共存**，不取代。用戶可選擇傳統或對話方式。

---

## 使用範例

```bash
# 自動偵測 scope（依 sdd_context stage）
/review-dialogue latest

# 明確指定 scope
/review-dialogue latest spec
/review-dialogue latest code
/review-dialogue latest test

# 指定 spec 目錄
/review-dialogue dev/specs/2026-02-25_1_feature-name/ code

# 恢復中斷的 dialogue
/review-dialogue dev/specs/2026-02-25_1_feature-name/ code resume
```
