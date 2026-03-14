---
description: "S7 提交階段 - 整理變更並提交。僅在 SOP 管線內使用。觸發：S6 通過後進入、「提交」、「commit」"
allowed-tools: Bash, Read, Grep, Glob, Task
argument-hint: "<commit-type: feat|fix|refactor|docs|chore>"
---

# S7 提交

## 環境資訊
- 當前分支: !`git branch --show-current`
- 變更狀態: !`git status --short`
- 變更統計: !`git diff --stat | tail -5`

## 輸入
提交類型（可選）：$ARGUMENTS

---

## Agent 調度

**本階段調度**：`git-operator`

```
Task(
  subagent_type: "git-operator",
  model: "sonnet",
  prompt: "整理變更並執行 git 提交：\n\n功能名稱：{feature}\n變更類型：{type}\n\nsdd_context_path: {sdd_context.json 完整路徑}\n\n請分析 git diff，分類檔案，生成 commit message 並執行提交。\n\n提交前必須生成 lessons_learned（what_went_well, what_went_wrong, new_pitfalls），寫入 sdd_context.json，並將 new_pitfalls 追加到 dev/knowledge/pitfalls.md。",
  description: "S7 Git 提交"
)
```

---

## 任務流程

1. **掃描變更**：git diff 分類（Frontend/Backend/Database/Config）
2. **生成 Commit Message**：`<type>(<scope>): <描述>` + 變更摘要 + `SDD Context: <feature>` + `Co-Authored-By`
3. **生成 Lessons Learned**：回顧 S0~S6，分析 what_went_well/wrong/new_pitfalls
4. **Pitfalls 追加**：new_pitfalls append 到 `dev/knowledge/pitfalls.md`
5. **執行提交**：`git add <specific-files>` + HEREDOC commit
6. **驗證提交**：`git status` + `git log -1`

---

## SDD Context 持久化

> 操作手冊見 `.claude/references/sdd-context-persistence.md`（S7 區段，含清理作業）

S7 開始時：更新 `current_stage` → `S7`、`stages.s6.status` → `completed`（S7 負責推進，同 S4 推進 S3、S6 推進 S5 的模式）

S7 更新欄位：`stages.s7.status→completed`、`output`（commit_hash, branch, changes, stats）、`lessons_learned`
頂層：`status→completed`、`completed_at`
清理：兩種模式都保留 `{spec_folder}/sdd_context.json`（`status: "completed"`）

---

## S7 Gate — SOP 流程完成

> Gate 行為依 `sdd_context.execution_mode` 決定。

### Autopilot 模式

🟢 **自動提交。** git-operator 自動執行 commit（不 push）。完成後顯示通知：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ SOP 完成 — {feature_name}
   Commit: {hash} ({branch})
   變更: {N} files (+{added} -{deleted})

   📊 摘要:
   - S1: {impact_scope 概述}
   - S4: {tasks_completed}/{total_tasks} 任務
   - S5: {conclusion}（{score}）
   - S6: {test_result}

   🔀 下一步選擇：
   1. 「merge」→ 本地合併到主分支
   2. 「PR」→ 建立 Pull Request
   3. 「保留」→ 保留分支，稍後處理（預設）
   4. 「丟棄」→ 丟棄分支（⚠️ 需三次確認）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Semi-Auto / Manual 模式

🟡 **確認！** 顯示變更摘要 + commit message 預覽，等待用戶確認。

✅ **SOP 已完成。** Commit 已建立，sdd_context 已標記 completed。

**下一步建議：**
- 🔀 建立 Pull Request（`gh pr create`）
- 📋 更新 Issue 狀態
- 📢 通知相關人員
