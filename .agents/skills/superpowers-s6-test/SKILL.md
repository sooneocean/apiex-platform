---
name: superpowers-s6-test
description: "S6 驗收測試轉接。Phase 1 TDD 合規審計（阻斷 Gate）→ Phase 2 E2E/整合驗收 → Phase 3 缺陷閉環。"
metadata:
  short-description: "S6 + TDD 審計/驗收轉接"
---

# S6 Test Adapter（TDD Audit + Acceptance）

## 何時用

當 `current_stage` 為 `S6`，或驗收測試/TDD 審計需求時。

## 三階段流程

### Phase 1: TDD 合規審計（阻斷 Gate）
- 讀取 `s4.output.tdd_summary` 和每個 `completed_tasks[].tdd_evidence`
- 驗證 red.exit_code == 1、green.exit_code == 0
- 驗證 skip_reason 合理性
- compliance < 100%（扣除合法 skip）→ **P1 回 S4**

### Phase 2: 驗收測試
- 逐條比對 S0 success_criteria
- E2E API / UI 測試
- 整合測試（資料流 pattern 匹配時觸發）
- 手動測試清單（UI/購買/狀態機時產出）

### Phase 3: 缺陷閉環
- 修復後也必須走 TDD（red→green commit pair）
- 最多 3 次，超過停下讓用戶裁決

## 強制約束

- 不再執行單元測試（S4 TDD 已覆蓋）
- 缺陷修復要記錄在 `stages.s6.output.defects` / TDD 證據
- 遵守迴圈上限：S4↔S6 最多 3 次
- 不可繞過 `sdd_context` 更新
- 必須提供實際測試命令與結果摘要
