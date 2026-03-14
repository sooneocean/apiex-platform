# 對抗式審查協議（Review Protocol）

> 本檔案定義 Code Review 和 Spec Review 共用的對抗式審查流程。
> 各審查 Skill 引用本檔案，僅定義各自差異部分。
> 用英文思考，但始終以繁體中文提供最終回應。

## 引擎選擇

| 引擎 | 條件 | R1 挑戰 | R2 防禦 | R3 裁決 |
|------|------|---------|---------|---------|
| **Codex（預設）** | 參數中不含 `opus` | Codex read-only + pre-fed context | Task(reviewer/architect) | Task(sonnet) |
| **Opus（fallback）** | 參數中包含 `opus`，或 Codex 失敗 | Task(opus) + pre-fed context | Task(reviewer/architect) | Task(sonnet) |

### Codex 執行設定

| 用途 | 模式 | 模型 |
|------|------|------|
| R1 挑戰 | `-s read-only`（僅讀取 input_context.md） | 不指定 `-m`，使用 Codex 預設模型 |

CLI：`codex exec -s read-only`（不加 `-m`，由 Codex CLI 使用帳號預設模型）

### Fallback 觸發條件

Codex CLI 執行失敗時自動切換至 Opus：
- exit code != 0
- 輸出為空或 <100 bytes
- 超時 120 秒

Fallback 通知格式：
```
⚠️ Codex 引擎執行失敗（原因：{error_reason}），已自動切換至 Opus 引擎完成審查。
```

## Session 隔離

```bash
SESSION=$(date +%Y%m%d_%H%M%S)
SESSION_DIR="/tmp/adversarial-review/$SESSION"
mkdir -p "$SESSION_DIR"
```

所有中介檔案存放在 `$SESSION_DIR/` 下，避免跨次審查互相干擾。

## 對抗式審查流程（Pre-Fed Context 架構）

```
┌──────────────────────────────────────────────────────────┐
│           對抗式審查流程（Pre-Fed Context）                 │
│                                                          │
│  Context Assembly（Claude 預組裝）                        │
│  ┌─────────────────────────────────┐                     │
│  │ 讀取 review-standards.md        │                     │
│  │ 讀取 output-schema.md           │                     │
│  │ 讀取審查目標（Spec/Diff/Source） │                     │
│  │ → 寫入 input_context.md         │                     │
│  └─────────────┬───────────────────┘                     │
│                │                                         │
│                ▼                                         │
│  Round 1 ─ 挑戰（Codex read-only 或 Opus）              │
│  ┌─────────────────────────────────┐                     │
│  │ 讀取 input_context.md（唯一輸入）│                     │
│  │ 依審查標準嚴格檢查              │                     │
│  │ 產出 → r1_findings.md           │                     │
│  └─────────────┬───────────────────┘                     │
│                │                                         │
│       ┌────────┴────────┐                                │
│       ▼                 ▼                                │
│  無 P0/P1            有 P0 或 P1                         │
│  (Short-Circuit)     繼續 R2+R3                          │
│       │                 │                                │
│       │                 ▼                                │
│       │  Round 2 ─ 防禦（reviewer/architect）            │
│       │  ┌─────────────────────────────────┐             │
│       │  │ 讀取 R1 findings                │             │
│       │  │ 逐條回應：接受/部分接受/反駁     │             │
│       │  │ 產出 → r2_defense.md            │             │
│       │  └─────────────┬───────────────────┘             │
│       │                │                                 │
│       │                ▼                                 │
│       │  Round 3 ─ 裁決（Sonnet，統一引擎）              │
│       │  ┌─────────────────────────────────┐             │
│       │  │ 讀取 r1 + r2 + input_context    │             │
│       │  │ 逐條裁決：接受/維持質疑          │             │
│       │  │ 產出 → r3_verdict.md            │             │
│       │  └─────────────┬───────────────────┘             │
│       │                │                                 │
│       ▼       ┌────────┴────────┐                        │
│   ✅ 直接通過  ✅ 共識通過    ⚠️ 仍有分歧                │
│                                呈現給用戶裁定              │
└──────────────────────────────────────────────────────────┘
```

**最多 3 輪**，防止無限迴圈。

## Round 定義

### R1 挑戰

**Codex 引擎**：
```bash
codex exec -s read-only \
  -o "$SESSION_DIR/r1_findings.md" \
  "{skill-name} Read $SESSION_DIR/input_context.md — it contains all review context. Output structured findings."
```

**Opus 引擎**（手動選擇或 fallback）：
```
Task(
  subagent_type: "general-purpose",
  model: "opus",
  prompt: "你是嚴格的審查專家，角色是**挑戰者**。
⚠️ 單引擎審查（Codex 不可用），需要比平常更嚴格。
請讀取 $SESSION_DIR/input_context.md，其中包含所有審查材料。
依照其中的 Review Standards 嚴格審查。按 Output Format 產出結構化 findings。
完成後將結果寫入 $SESSION_DIR/r1_findings.md",
  description: "{type} 挑戰審查（Opus fallback）"
)
```

### R1 Short-Circuit

- **無 P0 且無 P1** → 跳過 R2+R3，直接通過
- **有 P0 或 P1** → 進入 Round 2

### R2 防禦

使用 Task 調度 `reviewer`（Code Review）或 `architect`（Spec Review），逐條回應 R1 findings。

回應格式：
```markdown
### 問題 X：{問題標題}
**回應類型**：接受 / 部分接受 / 反駁
**論述**：{詳細技術論證}
**修正方案**：{如果接受，標記需修復；如果反駁，為什麼不是問題}
**證據**：{引用 codebase 中的實際程式碼或架構依據}
```

回應寫入 `$SESSION_DIR/r2_defense.md`。

### R3 裁決（統一 Sonnet）

> 消除 R1 與 R3 使用同一 GPT 模型的確認偏誤。

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "你是審查的**最終裁決者**。
請讀取：$SESSION_DIR/r1_findings.md、$SESSION_DIR/r2_defense.md、$SESSION_DIR/input_context.md
裁決規則：逐條對照 R1 質疑與 R2 回應，判斷 ✅ 接受回應 / ⚠️ 部分接受 / ❌ 維持質疑。
最終結論：pass / conditional_pass / fail。使用繁體中文。
完成後寫入 $SESSION_DIR/r3_verdict.md",
  description: "{type} 最終裁決（Sonnet）"
)
```

## 引擎啟動通知格式

每個 Round 開始前必須顯示：
```
🔄 Round {N} — {角色}
   引擎：{Codex / Opus}
   模型：{Codex 預設模型 / claude-opus-4-6 / claude-sonnet-4-6}
   模式：Pre-Fed Context（input_context.md）
   Session：{SESSION}
   狀態：執行中...
```

Fallback 時：
```
⚠️ Round {N} — Codex 執行失敗
   錯誤：{error_message}
   🔄 自動切換至 Opus 引擎（模型：claude-opus-4-6）
   狀態：重新執行中...
```

## 監控 Log

每次 Codex/Opus 調用後追加 JSONL 到 `dev/logs/codex-review.jsonl`：

```bash
echo '{"timestamp":"'$(date -Iseconds)'","type":"{review-type}","round":"R1","engine":"codex","exit_code":'$?',"output_size":'$(wc -c < "$SESSION_DIR/r1_findings.md" 2>/dev/null || echo 0)',"session":"'$SESSION'"}' \
  >> dev/logs/codex-review.jsonl
```

## 中介檔案協議

| 檔案 | 產出者 | 消費者 | 說明 |
|------|--------|--------|------|
| `input_context.md` | Claude（Context Assembly） | R1、R3 | 所有審查材料的單一入口 |
| `r1_findings.md` | R1 挑戰者 | R2、R3 | P0/P1/P2 問題清單 |
| `r2_defense.md` | R2 防禦者 | R3 | 逐條回應 |
| `r3_verdict.md` | R3 裁決者 | 最終報告 | 逐條裁決與結論 |

## 大小控制（Context Assembly）

- Diff >200KB → 每檔只保留 ±50 行 context
- Source files 只含 changed files（Code Review）/ spec 提到的關鍵檔案（Spec Review）
- 總計 ≤300KB

## Contracts 引用

R2 防禦者在進行防禦時，應參考 `dev/specs/_shared/` 下的 contracts 文件：
- `sdd-context-contract.md`：確認 Codex 可讀/禁寫欄位邊界
- `review-io-contract.md`：確認 R1/R2/R3 中介檔案格式正確
- `gate-readonly-contract.md`：確認 Codex 在各 Gate 的角色邊界

## engine_used 記錄

S2/S5 審查完成後，必須在 sdd_context.json 的對應 output 中記錄 `engine_used` 欄位：
- `"codex"`：使用 Codex CLI 完成 R1 審查
- `"opus_fallback"`：Codex 失敗後自動切換至 Opus 完成審查

## Code Review vs Spec Review 差異

| 項目 | Code Review | Spec Review |
|------|-------------|-------------|
| R2 Agent | `reviewer` | `architect` |
| Codex Skill | `code-review-challenge` | `spec-review-challenge` |
| Review Standards 路徑 | `~/.codex/skills/code-review-challenge/references/` | `~/.codex/skills/spec-review-challenge/references/` |
| 審查目標 | git diff + source files | s1_dev_spec.md（完整） |
| 額外參考 | Spec task + DoD | s0_brief_spec.md（背景） |
| 完整性評分 | 無 | 有（任務清單、驗收標準、技術決策等） |
