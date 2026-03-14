---
description: "Spec 收斂迴圈 — Codex 審查 + Claude 修正，迭代至 P0=P1=P2=0。觸發：「收斂 spec」、「converge spec」、「跟 codex 對齊」、「spec 收斂」"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task
argument-hint: "<spec 檔案路徑 | latest>"
---

# /spec-converge — Spec 迭代收斂迴圈

> Codex 審查 → Claude 修正 → 重複直到零 issue 或達到上限。
> Session 目錄決策規則見 `.claude/references/review-protocol.md`

## 環境資訊
- 當前分支: !`git branch --show-current`
- Codex 版本: !`codex --version 2>/dev/null || echo "NOT FOUND"`

## 輸入
目標：$ARGUMENTS

---

## 硬性規則（MUST）

1. **最多 5 輪**。第 5 輪仍未收斂 → 強制停止，輸出最終狀態讓用戶裁定。
2. **收斂條件**：P0=0 且 P1=0 且 P2=0 → APPROVED。
3. **每輪必須顯示狀態面板**（見下方格式）。
4. **禁止跳過 Codex**。每輪的審查一定要經過 Codex CLI，不可自己審自己。
5. **禁止自我滿足**。即使你覺得已經很好了，仍然要送 Codex 驗證。
6. **修正必須保守**。只修 Codex 指出的問題，不要順手「改善」其他部分。
7. **Session 日誌**。完整對話紀錄寫入 `$SESSION_DIR/session-log.md`。

---

## 流程

### 0. 初始化

- 如果 `$ARGUMENTS` 是檔案路徑 → 讀取該檔案作為初始 spec
- 如果 `$ARGUMENTS` 為 `latest` → 用 Glob 找最新的 `dev/specs/*/s1_dev_spec.md`，取修改時間最新的
- 如果 `$ARGUMENTS` 為空 → 提示用戶提供 spec 路徑（**不支援 stdin**）

**Session 目錄決策**（見 `review-protocol.md §Session 目錄決策規則`）：

```bash
# 決定 converge 目錄（支援相對和絕對路徑）
if [[ "$SPEC_PATH" == */dev/specs/* ]] || [[ "$SPEC_PATH" == dev/specs/* ]]; then
  SPEC_FOLDER=$(dirname "$SPEC_PATH")
  SESSION_DIR="$SPEC_FOLDER/review/converge"
else
  SESSION=$(date +%Y%m%d_%H%M%S)
  SESSION_DIR="/tmp/spec-converge/$SESSION"
fi
mkdir -p "$SESSION_DIR"
```

重新收斂時：清除 `converge/` 下所有舊的 review-r*/revision-r*/spec-v* 檔案，重新開始。

- 複製初始 spec 到 `$SESSION_DIR/spec-v0.md`（保留原始版本）
- 複製初始 spec 到 `$SESSION_DIR/spec-current.md`（工作副本）

### 1. 迴圈開始（Round N = 1~5）

顯示狀態面板：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round {N}/5 — Codex 審查中
   Session: {SESSION}
   Spec 版本: v{N-1}
   狀態: 送審中...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. 呼叫 Codex 審查

#### Context Assembly

讀取以下檔案並組裝成 `$SESSION_DIR/review-input-r{N}.md`：

1. **Review Standards**：讀取 `.claude/references/review-standards.md`
2. **Output Schema**：讀取 `.claude/references/review-convergence-output-schema.md`（收斂專用，decision 為 APPROVED/REJECTED）
   - **Fallback**：若路徑不存在，退而讀取 `.claude/references/review-output-schema.md`（通用版），再不存在則直接內嵌精簡 schema
3. **Spec 內容**：讀取 `$SESSION_DIR/spec-current.md`
4. **前輪歷史**（非首輪）：附加前輪審查結果 + 修正摘要

組裝格式：
```markdown
# Spec Review Task

你是嚴格的 Spec 審查專家。請審查以下 spec，找出所有問題。

## Review Standards

{review-standards.md 的完整內容}

## Output Format

{convergence-output-schema.md 的完整內容}

> **收斂模式補充規則**：
> - 如果前輪修正已解決某問題，不要重複提出。
> - 每個 finding 必須有具體 evidence，不可模糊形容。
> - 本次為收斂模式審查，不提供 codebase 檔案。請基於 spec 內部一致性和技術合規性審查。

## 待審查 Spec

{spec-current.md 的完整內容}

## 前輪審查歷史（如果有）

### Round {N-1} 審查結果
{上一輪 Codex 的 findings}

### Round {N-1} 修正摘要
{上一輪 Claude 的修正說明}
```

#### 呼叫 Codex（透過 codex-liaison Agent）

```
Task(
  subagent_type: "codex-liaison",
  model: "sonnet",
  prompt: "執行 Spec Converge Round {N} 審查：\n\n
場景：spec-converge\n
scope: spec\n
sandbox_mode: read-only\n
round: {N}\n
session_dir: $SESSION_DIR\n
input_path: $SESSION_DIR/review-input-r{N}.md\n
output_path: $SESSION_DIR/review-r{N}.md\n\n
Codex prompt: Read the file at $SESSION_DIR/review-input-r{N}.md and perform the spec review as instructed. Output findings in the exact format specified.\n\n
⚠️ Fallback 時的額外規則：decision 欄位使用 APPROVED 或 REJECTED，totals 格式為 P0=N, P1=N, P2=N。\n
完成後回傳結構化 JSON（type=codex-converge）。",
  description: "Spec Converge Round {N}"
)
```

> **Fallback**：codex-liaison 內建 Fallback 邏輯。Codex 失敗時自動降級，以更嚴格的標準執行替代審查。

### 3. 解析審查結果

從 `review-r{N}.md` 解析：
- 用 grep 找 `totals: P0=` 行
- 提取 P0、P1、P2 數字
- **如果解析失敗**（格式不對）→ 視為 REJECTED，P0=0 P1=0 P2=1（格式問題算一個 P2），繼續迴圈

更新狀態面板：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round {N}/5 — 審查結果
   P0: {n}  P1: {n}  P2: {n}
   Decision: {APPROVED | REJECTED}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 4. 收斂檢查

- **P0=0 且 P1=0 且 P2=0** → 跳到步驟 6（完成）
- **否則且 N < 5** → 繼續步驟 5（修正）
- **N = 5** → 跳到步驟 7（強制停止）

### 5. Claude 修正 Spec

讀取 `review-r{N}.md` 中的每個 finding，**逐條修正** `spec-current.md`：
- 只修 Codex 指出的問題
- 不做額外「改善」
- 每個修正附上簡短說明

修正完成後：
- 保存為 `$SESSION_DIR/spec-v{N}.md`
- 更新 `$SESSION_DIR/spec-current.md`
- 記錄修正摘要到 `$SESSION_DIR/revision-r{N}.md`

顯示修正摘要：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round {N}/5 — 修正完成
   修正項目: {n} 項
   摘要:
   - [SR-P1-001] {修正說明}
   - [SR-P2-001] {修正說明}
   → 進入 Round {N+1}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

回到步驟 1，N = N+1。

### 6. 收斂完成

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APPROVED — Round {N}/5 收斂
   P0: 0  P1: 0  P2: 0
   總修正輪數: {N}
   Session: {SESSION}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- 顯示 diff（spec-v0 vs spec-current）：用 `diff` 指令
- **回寫策略**：
  - 如果 `$SESSION_DIR` 在 `dev/specs/` 下（spec 目錄模式）→ **直接回寫**原檔，不詢問（converge 已在 spec 目錄內，無需搬運）
  - 否則（`/tmp/` fallback 模式）→ **詢問用戶**是否要回寫原檔
    - 是 → 用 Write 工具覆寫原始路徑
    - 否 → 告知最終版本在 `$SESSION_DIR/spec-current.md`
- 寫入 session log

### 7. 未收斂強制停止

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
未收斂 — 5 輪用盡
   最終狀態: P0={n} P1={n} P2={n}
   Session: {SESSION}

   可能原因：
   - Codex 反覆提出新問題（spec 範圍過大？）
   - 修正引入新問題（修正品質問題？）
   - 審查標準過嚴

   建議：
   - 檢查 session log 判斷卡在哪裡
   - 考慮拆分 spec
   - 手動裁定剩餘 issue
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- 顯示剩餘 findings
- 顯示最終 spec 位置（`$SESSION_DIR/spec-current.md`）
- 寫入 session log

---

## Session Log 格式

寫入 `$SESSION_DIR/session-log.md`：

```markdown
# Spec Converge Session: {SESSION}

- 開始時間: {timestamp}
- 輸入: {file_path}
- 結果: {APPROVED at Round N | NOT_CONVERGED after 5 rounds}

## Round 1
### Codex 審查
{review-r1.md 摘要}
### Claude 修正
{revision-r1.md}

## Round 2
...

## 最終 Diff
{spec-v0 vs spec-current}
```

---

## 監控 Log

> 由 `codex-liaison` Agent 負責寫入 `dev/logs/codex-review.jsonl`，Skill 不需自行處理。
> 格式：`{"timestamp":..., "type":"spec-converge", "round":"R{N}", "engine":"codex|fallback", ...}`

---

## 使用範例

```bash
# 審查指定 spec 檔案
/spec-converge dev/specs/2026-02-24_1_feature-name/s1_dev_spec.md

# 審查最新 spec
/spec-converge latest
```

---

## 與現有 Skill 的關係

| Skill | 用途 | 差異 |
|-------|------|------|
| `/spec-review` | 單次對抗式審查（R1/R2/R3） | 不修正，只找問題 |
| `/spec-converge` | 迭代收斂迴圈 | 找問題 + 修正，直到通過 |
| `/s2-spec-review` | SOP 管線內的審查 | 在 S1→S3 之間，有 Gate |
