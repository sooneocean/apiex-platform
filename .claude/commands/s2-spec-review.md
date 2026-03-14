---
description: "S2 Spec 審查 - 對抗式審查 dev_spec。僅在 SOP 管線內使用，不用於獨立審查。觸發：S1 完成後自動進入"
allowed-tools: Read, Bash, Grep, Glob, Task, Write, mcp__sequential-thinking__sequentialthinking
argument-hint: "<SDD-Context-JSON>"
---

# S2 Spec Review（對抗式審查）

> 對抗式審查協議見 `.claude/references/review-protocol.md`
> Spec Review 細節見 `.claude/commands/spec-review.md`

## 環境資訊
- 當前分支: !`git branch --show-current`

## 輸入
S0~S1 輸出：$ARGUMENTS

---

## 核心原則

> **S2 是 Spec 品質把關的最後一道防線。** 在寫碼前確認 dev_spec 正確與完整。

---

## Spec Mode 判斷

| Spec Mode | 審查方式 | 說明 |
|-----------|---------|------|
| **Full Spec** | Phase 0 (預審) → Phase 0.5 (合併) → R1→R2→R3 | 預審 + 對抗式 3 輪 |
| **Quick** | **跳過 S2** | 直接進 S3，品質把關延後到 S5 |

### Quick 模式處理

跳過理由：規模小 + 避免 architect 自我審查。更新 SDD Context 後直接調用 `Skill(skill: "s3-plan")`。

---

## Full Spec 模式：預審 + 對抗式審查

### 審查目標

> 審查焦點是 `s1_dev_spec.md`。`s0_brief_spec.md` 僅背景參考，不做修改要求。

從 `sdd_context.spec_folder` 取得 dev_spec_path 和 brief_spec_path。

---

### Phase 0：Spec 預審（並行）

> **目的**：在 R1 對抗式審查前，讓 codebase-explorer 先發現引用問題，豐富 R1 審查素材。

**預審**（與 R1 同時發出，不增加延遲）：

codebase-explorer — Spec 引用預審
```
Task(
  subagent_type: "codebase-explorer",
  model: "sonnet",
  prompt: "讀取 {spec_folder}/s1_dev_spec.md，驗證所有技術引用：\n\n1. class/method/endpoint/table 名稱是否存在於 codebase\n2. API endpoint 的 HTTP method + path 是否與實際 Controller 一致\n3. 前端元件名稱是否與實際檔案匹配\n\n產出 SR-prefixed findings（SR-PRE-001 格式），每個 finding 包含：\n- ID：SR-PRE-{NNN}\n- 嚴重度：P0/P1/P2\n- 描述：引用名稱 vs 實際名稱\n- 建議：修正方向",
  description: "S2 Spec 預審"
)
```

> **如有技術棧 Agent**，可並行發出多個 Domain Expert 預審（DB 設計、API 設計等）。

**R1 挑戰**（與預審並行發出，同一 message）：
> R1 引擎選擇、Fallback 規則見 `review-protocol.md`

---

### Phase 0.5：合併預審 Findings 到 input_context

Skill（Orchestrator）收集 Phase 0 報告，合併為預審發現，插入 Context Assembly。

**Context Assembly 結構**（6 個區段）：

| # | 區段 | 來源 | 說明 |
|---|------|------|------|
| 1 | Review Standards | review-standards.md | 不動 |
| 2 | Output Schema | output-schema.md | 不動 |
| 3 | S1 Dev Spec（完整）| s1_dev_spec.md | 不動 |
| 4 | S0 Brief Spec（背景）| s0_brief_spec.md | 不動 |
| 5 | Codebase 關鍵檔案 | 程式碼片段 | 不動 |
| 6 | **預審發現（NEW）** | Phase 0 合併結果 | 新增 |

**第 6 區段格式**：

```markdown
=== 預審發現 ===

以下問題在 R1 前由預審獨立發現。R1 挑戰者應獨立驗證這些發現，並尋找額外問題。

### Spec 引用驗證（codebase-explorer）
{引用驗證結果}

### 預審統計
- 總計：P0={N}, P1={N}, P2={N}
```

**對 R1 的額外指引**：

```
⚠️ 本次審查包含預審結果（第 6 區段）。
你應該：
1. 獨立驗證 findings（不盲從，確認是否為真正問題）
2. 在 findings 之外尋找額外問題（架構、一致性、完整性）
3. 若 finding 與你的判斷矛盾，在 findings 中說明分歧理由
```

**大小控制**：預審 findings >30KB → 只保留 P0 + P1，P2 以摘要替代。

**Orchestrator 合併**（兩者完成後）：
1. R1 findings 優先（同一問題保留 R1 版本，R1 更權威）
2. 預審獨有的 findings 追加到 r1_findings.md（SR-PRE- prefix 保留以區分來源）
3. 合併後覆寫 `{spec_folder}/review/r1_findings.md`

---

### R1~R3 執行

> Session 隔離、中介檔案協議、引擎選擇、Fallback、Short-Circuit 規則見 `review-protocol.md`

- R2 使用 `architect` Agent（Spec Review 專用）
- 監控 Log type：`"type": "s2-spec-review"`
- **Context 組裝**已在 Phase 0.5 完成（含 6 個區段）

R1/R2/R3 流程**完全不變**，只是 R1 拿到更豐富的 input_context。

- **前端 Handoff 前置檢查**：若 dev_spec 任務中存在前端任務，確認 `s1_frontend_handoff.md` 包含必要區段。**缺少 → Gate 結果 `fail`，修正 handoff 後重審。**

---

## 錯誤處理

| 情境 | 處理方式 |
|------|---------|
| Phase 0 某個預審 Agent 失敗/超時 | **降級**：input_context 不含該維度的預審結果，R1 正常進行 |
| Phase 0 全部 Agent 失敗 | **降級**：跳過 Phase 0/0.5，退回原流程（5 區段），R1 正常進行 |
| Phase 0 結果過大（>30KB） | 截斷：只保留 P0 + P1，P2 以摘要替代 |

---

## 審查報告產出（Full Spec 模式）

> 模板：`dev/specs/_templates/s2_review_report_template.md`

R1~R3 完成後（含 Short-Circuit），**必須**產出 `{spec_folder}/s2_review_report.md`：

1. 從 R1/R2/R3 中介檔案提取結構化內容（Short-Circuit 時只有 R1）
2. 依模板填入：審查摘要、問題清單與處置（含 R2 回應 + R3 裁決）、完整性評分、審查軌跡
3. 若有修正 `s1_dev_spec.md`，在「修正摘要」區段記錄修正前後差異
4. 使用 Write tool 寫入 `{spec_folder}/s2_review_report.md`

**報告額外包含**：
- 「預審摘要」區段：列出 Phase 0 的 P0/P1/P2 統計與關鍵發現
- R1 是否驗證了 findings、是否發現額外問題

---

## SDD Context 持久化

> 操作手冊見 `.claude/references/sdd-context-persistence.md`（S2 區段）

| 模式 | status | current_stage |
|------|--------|---------------|
| Full Spec 通過 | completed | → S3 |
| Full Spec 需修正 | fix_required | 維持 S2 |
| Quick | skipped | → S3 |

Full Spec 模式額外記錄：
- `stages.s2.supporting_agents`：Phase 0 參與的 Agent 列表
- `stages.s2.output.pre_review`：預審結果摘要

---

## S2 Gate

| 結果 | 行動 |
|------|------|
| pass（含 Short-Circuit） | 自動進入 S3 執行計畫 |
| conditional_pass | 討論後修正 spec → 重審或直接進 S3 |
| fail | 調整 dev_spec → 重新 S2 審查 |
| 有分歧 | 呈現雙方立場，由用戶裁定 |
