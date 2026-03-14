# Spec Review Output Schema — Convergence Mode

> 禁止在最終輸出夾帶思考過程/內部推理，只允許結論與必要依據。
> 本 schema 專用於收斂模式（spec-converge），與對抗式審查的 output-schema.md 有以下差異：
> - decision 使用 `APPROVED | REJECTED`（非 `PASS | PASS_WITH_FIXES | BLOCKED`）
> - APPROVED 條件：P0=0 且 P1=0 且 P2=0

## Severity Definition

- P0: 設計/規格層錯誤，會導致方向錯誤或架構衝突，必須先修再做
- P1: 實作層問題，會造成 bug/風險/不可維護，必須修
- P2: 改善建議，不阻擋合併

## Findings

### [SR-P1-001] P1 - 問題標題

- id: `SR-P1-001`
- severity: `P0 | P1 | P2`
- category: `architecture | logic | security | test | hardcode | duplication | performance | consistency`
- file: `path/to/file` or `spec section`
- line: `行號 or N/A`
- rule: `違反的規則/標準`
- evidence: `具體觀察到的事實，不要抽象形容`
- impact: `風險與影響範圍`
- fix: `可執行修復建議`

### ID 命名規則

- Spec Review: `SR-{severity}-{序號}` (e.g. `SR-P0-001`, `SR-P1-002`)
- 嚴重度只允許：`P0 | P1 | P2`
- 序號固定三碼，同一輪不可重複，`001` 起跳
- 一個 finding 只講一件事
- 必填：id / severity / file / rule / evidence / fix
- 沒有證據就不要開 finding

## Summary

- totals: `P0=N, P1=N, P2=N`
- decision: `APPROVED | REJECTED`

> **APPROVED** 條件：P0=0 且 P1=0 且 P2=0。有任何 finding 就是 REJECTED。
