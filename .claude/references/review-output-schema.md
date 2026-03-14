# Review Output Schema

> 審查 Findings 的結構化輸出格式。R1 挑戰者必須嚴格遵循此格式。
> 適用於 Spec Review、Code Review、Test Review。

---

## 1. R1 Findings 輸出格式

```markdown
# R1 Findings

review_type: {spec_review | code_review | test_review}
scope: {spec | code | test}
session: {session_id}
timestamp: {ISO8601}

## Summary

| Severity | Count |
|----------|-------|
| P0       | {n}   |
| P1       | {n}   |
| P2       | {n}   |

**Decision**: {pass | conditional_pass | fix_required | redesign_required}
**Blocking Reasons**: {P0/P1 Finding ID 清單，或 "None"}

## Findings

### {SR|CR|TR}-{P0|P1|P2}-001: {問題標題}

- **Severity**: P0 | P1 | P2
- **Category**: {security | logic | architecture | naming | performance | compliance | completeness | consistency}
- **File**: {檔案路徑或 Spec section}
- **Line**: {行號}（如適用）
- **Description**: {問題描述 — 具體說明什麼是錯的}
- **Evidence**: {引用程式碼片段、spec 原文段落、或測試 log}
- **Recommendation**: {具體修正建議}
- **Status**: new
```

---

## 2. Decision 判定規則

| 條件 | Decision |
|------|----------|
| P0 > 0（架構或安全根本錯誤） | `redesign_required` |
| P0 > 0（可修復的嚴重問題） | `fix_required` |
| P0 = 0 且 P1 > 0 | `conditional_pass`（修正 P1 後通過）|
| P0 = 0 且 P1 = 0 且 P2 ≥ 0 | `pass` |

---

## 3. Dialogue Review 專用欄位

Dialogue 模式下，每個 finding 額外包含 status tracking：

```markdown
- **Status**: new | confirmed_fixed | defense_accepted | defense_rejected_with_evidence | fix_attempted_but_still_failing
```

### Status 轉換

```
new → confirmed_fixed          # Claude 修正後 Codex 確認
new → defense_accepted         # Claude 防禦成功，Codex 接受
new → defense_rejected_with_evidence  # Claude 防禦失敗，Codex 附新證據駁回
new → fix_attempted_but_still_failing # （test scope）修正後重跑仍失敗
```

---

## 4. Dialogue 收斂條件

| Scope | 收斂條件 | 說明 |
|-------|---------|------|
| `spec` | P0 = 0 且 P1 = 0 | P2 容忍不阻斷 |
| `code` | P0 = 0 且 P1 = 0 | P2 容忍不阻斷 |
| `test` | P0 = 0 且 P1 = 0 且 P2 = 0 | 零容忍 |

---

## 5. Dialogue Turn 格式

### Codex Review Turn

```markdown
---
turn: {N}
actor: codex
type: review
scope: {spec|code|test}
timestamp: {ISO8601}
references_turn: {上一個 claude turn number}
---

# Review Turn {N}

## New Findings
{新發現的問題，格式同 R1 Findings}

## Previously Reported — Status Updates

### {finding_id}: {title}
- **Previous Status**: {舊 status}
- **New Status**: confirmed_fixed | defense_accepted | defense_rejected_with_evidence
- **Evidence**: {確認修正的驗證 / 接受防禦的理由 / 駁回防禦的新證據}

## Summary

| Category | Count |
|----------|-------|
| New findings | {n} |
| Confirmed fixed | {n} |
| Defense accepted | {n} |
| Defense rejected | {n} |
| Still open | {n} |

**Open P0**: {n}  **Open P1**: {n}  **Open P2**: {n}
**Decision**: CONTINUE | APPROVED
```

### Claude Response Turn

```markdown
---
turn: {N}
actor: claude
type: response
scope: {spec|code|test}
timestamp: {ISO8601}
references_turn: {上一個 codex turn number}
---

# Response to Turn {codex_turn}

## Finding Responses

### {finding_id}: {title}
- **Action**: accept_and_fix | defend
- **Verification**: {獨立驗證過程和結果}
- **Fix Applied** (if accept): {修正描述 + diff 摘要}
- **Build/Test Result** (if code/test): {靜態分析或測試重跑結果}
- **Counter-Evidence** (if defend): {file:line + 實際內容}
- **Conclusion**: {為什麼接受/防禦}

## Summary
- Accepted & Fixed: {n}
- Defended: {n}
- Fix Attempted Still Failing: {n}
```

---

## 6. Finding ID 命名規則

| 審查類型 | 前綴 | 範例 |
|---------|------|------|
| Spec Review | `SR` | `SR-P0-001`, `SR-P1-002` |
| Code Review | `CR` | `CR-P0-001`, `CR-P1-002` |
| Test Review | `TR` | `TR-P0-001`, `TR-P1-002` |

格式：`{Type}-{Severity}-{SeqNum}`（SeqNum 三位數，從 001 開始）

---

## 7. Completeness Score（Spec Review 專用）

Spec Review 的 R1 findings 須額外包含完整性評分：

```markdown
## Completeness Score

| 檢查項目 | 評等 | 備註 |
|---------|------|------|
| 任務清單 & DoD | A-F | {評語} |
| 驗收標準 | A-F | {評語} |
| 技術決策 | A-F | {評語} |
| User/Data Flow | A-F | {評語} |
| 影響範圍 | A-F | {評語} |
| 風險評估 | A-F | {評語} |
| Codebase 一致性 | A-F 或 N/A | {評語} |
```
