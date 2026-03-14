---
name: superpowers-s4-implement
description: "S4 TDD 實作轉接。強制 Red-Green-Refactor 三步驟，每個任務產出 TDD 證據與 commit pair。"
metadata:
  short-description: "S4 + 嚴格 TDD 轉接"
---

# S4 Implement Adapter（TDD Enforced）

## 何時用

當 `current_stage` 為 `S4`，或你正在實作 S3 任務時。

## TDD 三步驟（強制）

每個任務必須走：
1. **RED**：根據 S3 tdd_plan 寫失敗測試 → 執行測試指令 → MUST FAIL → `git commit -m "test(red): T{N} {描述}"`
2. **GREEN**：寫最少實作碼讓測試通過 → 執行測試指令 → MUST PASS → `git commit -m "feat(green): T{N} {描述}"`
3. **REFACTOR**（可選）：重構 → 測試 MUST STILL PASS → `git commit -m "refactor: T{N} {描述}"`

## 證據記錄

每個任務完成後更新 `stages.s4.output.completed_tasks[]`，包含：
- `tdd_evidence.red`: test_command, exit_code(1), output_summary, commit_hash, timestamp
- `tdd_evidence.green`: test_command, exit_code(0), output_summary, commit_hash, timestamp
- `tdd_evidence.refactor`: commit_hash, test_still_passing（可選）

無可測邏輯時：`tdd_evidence.skipped: true` + `skip_reason`（必須先嘗試寫測試後才可標記）。

## 強制約束

- 任務與波次來源必須是 `s3_implementation_plan.md`
- 實作完要更新 `stages.s4.output.completed_tasks`、`changes`、`progress`、`tdd_summary`
- S4 只能把結果推進到 S5，不可跳過既有 review 協議
- 遵循 repo 的 `CLAUDE.md` / `AGENTS.md` 中規定的架構模式與技術棧規則

## 禁用項

- 預設禁用 `subagent-driven-development` 全自動執行
- 預設禁用 superpowers 的獨立 code-review 流程取代 S5
