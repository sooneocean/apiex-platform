# Adversarial Review Output Schema (Markdown)

> 禁止在最終輸出夾帶思考過程/內部推理，只允許結論與必要依據。

## Metadata

- review_type: `code` | `spec`
- round: `R1` | `R2` | `R3`
- target: `<latest | spec_path | git_range>`
- base_commit: `<sha>`
- head_commit: `<sha>`
- generated_at: `<ISO-8601>`
- reviewer: `<agent/model>`

## Severity Definition

- P0: 設計/規格層錯誤，會導致方向錯誤或架構衝突，必須先修再做
- P1: 實作層問題，會造成 bug/風險/不可維護，必須修
- P2: 改善建議，不阻擋合併

## Findings

### [CR-P1-001] P1 - 問題標題

- id: `CR-P1-001`
- severity: `P0 | P1 | P2`
- category: `architecture | logic | security | test | hardcode | duplication | performance | consistency`
- file: `path/to/file`
- line: `行號 or N/A`
- rule: `違反的規則/標準`
- evidence: `具體觀察到的事實，不要抽象形容`
- impact: `風險與影響範圍`
- fix: `可執行修復建議`
- confidence: `high | medium | low`

### ID 命名規則

- Code Review: `CR-{severity}-{序號}` (e.g. `CR-P0-001`, `CR-P1-002`)
- Spec Review: `SR-{severity}-{序號}` (e.g. `SR-P0-001`, `SR-P1-002`)
- 嚴重度只允許：`P0 | P1 | P2`
- 序號固定三碼，同一輪不可重複，`001` 起跳
- 一個 finding 只講一件事
- 必填：id / severity / file / line / rule / evidence / fix
- 沒有證據就不要開 finding

## Summary

- totals: `P0=N, P1=N, P2=N`
- decision: `PASS | PASS_WITH_FIXES | BLOCKED`
- blocking_reasons:
  - `reason 1`
  - `reason 2`

## Follow-ups

- assumptions:
  - `assumption`
- questions:
  - `open question`
- verification_commands:
  - `command`
