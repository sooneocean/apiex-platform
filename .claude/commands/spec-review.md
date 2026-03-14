---
description: "Spec 審查（獨立使用）- 審查規格文件，不需要在 SOP 流程中。觸發：「審查 spec」、「review spec」"
allowed-tools: Read, Bash, Grep, Glob, Task, mcp__sequential-thinking__sequentialthinking
argument-hint: "[opus] <spec 檔案路徑 | spec 目錄路徑 | latest>"
---

# Spec 審查（對抗式雙 AI 審查）— Pre-Fed Context 架構

> 共用對抗式審查協議（引擎選擇、R1/R2/R3 流程、Session 隔離、監控 Log、中介檔案）見 `.claude/references/review-protocol.md`

## 環境資訊
- 當前分支: !`git branch --show-current`

## 輸入
審查目標：$ARGUMENTS

---

## Spec Review 設定（相對於共用協議的差異）

| 項目 | Spec Review 設定 |
|------|-----------------|
| R2 防禦 Agent | `architect` |
| Codex Skill | `spec-review-challenge` |
| Standards 路徑 | `~/.codex/skills/spec-review-challenge/references/` |
| 審查目標 | `s1_dev_spec.md`（完整內容，不可截斷） |
| 額外參考 | `s0_brief_spec.md`（背景）+ codebase 相關檔案 |
| 完整性評分 | 有（任務清單、驗收標準、技術決策等） |

---

## 任務流程

### 1. 解析參數

- `latest` → Codex，自動定位最新 `s1_dev_spec.md`
- `opus latest` → Opus 引擎
- `dev/specs/.../s1_dev_spec.md` → 指定檔案
- 指定目錄 → 僅審查其中的 `s1_dev_spec.md`

> **核心原則**：審查焦點是 `s1_dev_spec.md`。`s0_brief_spec.md` 僅背景參考，不做修改要求。

### 2. Context Assembly

> Session 隔離、大小控制見 `review-protocol.md`

組裝 `$SESSION_DIR/input_context.md`：Review Standards + Output Schema + S1 Dev Spec（完整）+ S0 Brief Spec + Codebase 關鍵檔案（Grep 找 spec 提到的 class/endpoint）。總計 ≤300KB。

### 3. R1→R2→R3 執行（Orchestrator 並行調度）

> 引擎選擇、Codex CLI 指令、Fallback、Short-Circuit 規則見 `review-protocol.md`

#### R1 挑戰（codex-liaison Agent）

```
Task(
  subagent_type: "codex-liaison",
  model: "sonnet",
  prompt: "執行 Spec Review R1 挑戰：\n\n
場景：spec-review\n
scope: spec\n
sandbox_mode: workspace-write\n
codex_skill: spec-review-challenge\n
session_dir: $SESSION_DIR\n
input_context_path: $SESSION_DIR/input_context.md\n
output_path: $SESSION_DIR/r1_findings.md\n\n
讀取 input_context.md，使用 Codex exec 呼叫 spec-review-challenge skill 進行 R1 挑戰。\n
完成後回傳結構化 JSON（type=codex-review, scope=spec）。",
  description: "Spec Review R1 挑戰"
)
```

> **Short-Circuit**：R1 結果 P0=P1=0 → 跳過 R2+R3，直接通過。

#### R2 防禦（architect Agent）

- `Task(subagent_type: "architect")` — 接收 R1 findings，逐條防禦/接受

#### R3 裁決

- `Task(subagent_type: "general-purpose", model: "sonnet")` — 最終裁決

### 4. 完整性評分（Spec Review 專有）

| 檢查項目 | 內容 |
|---------|------|
| 任務清單 & DoD | 拆解是否合理、DoD 可驗證 |
| 驗收標準 | 是否明確、可測試 |
| 技術決策 | 架構選擇、設計模式 |
| User/Data Flow | 流程是否完整正確 |
| 影響範圍 | 受影響檔案/模組是否遺漏 |
| 風險評估 | 關鍵風險是否被識別 |
| Codebase 一致性 | class/method/endpoint 是否與實際吻合 |

---

## 使用範例

```bash
/spec-review latest                                        # Codex，最新 spec
/spec-review dev/specs/2026-02-09_1500_xxx/s1_dev_spec.md  # 指定檔案
/spec-review opus latest                                   # Opus 引擎
```
