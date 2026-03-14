---
name: superpowers-s7-commit
description: "S7 收尾轉接。借用 superpowers:finishing-a-development-branch 的收尾檢查，但保持 SOP 的 S7 提交流程與 lessons learned。"
metadata:
  short-description: "S7 + branch finish 轉接"
---

# S7 Commit Adapter

## 何時用

當 `current_stage` 為 `S7`，準備提交或收尾分支時。

## 套用原則（來自 superpowers）

- 先完整驗證測試，再做收尾決策（merge/PR/保留分支）
- 收尾前先把狀態講清楚，不掩蓋未解問題

## 強制約束

- Commit 流程仍使用既有 S7 規則（含 lessons_learned 與 pitfalls 追加）
- 必須更新 `stages.s7.output` 與頂層 `status=completed`
- 未經使用者同意，不可自動清理分支或刪工作樹

## 建議收尾順序

1. 再跑一次關鍵驗證（依 repo 技術棧執行 build/test）
2. 生成 commit message 與變更摘要
3. 回寫 `sdd_context.json`
4. 再讓使用者決定 PR/merge/保留分支
