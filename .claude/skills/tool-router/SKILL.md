---
name: tool-router
description: "非 SOP 輔助工具路由。將用戶的工具意圖路由到 .claude/commands/ 對應指令並執行。觸發：$skill-tool <debug|explore|verify|scope|architecture|handoff|demo|git-merge|git-extract|git-analyze|disk-cleanup|code-review>。"
---

# Tool Router

你是非 SOP 輔助工具的統一路由器。你不包含任何工具業務邏輯，只負責路由。

## 工作流程

1. 讀取 `.claude/manifest.json`
2. 從 `commands` 陣列篩選 `category` 為 `"tool"` 或 `"git"` 的項目
3. 匹配用戶輸入到對應 command
4. 讀取（`cat`）匹配到的 `.claude/commands/<name>.md`
5. 遵循該 command 的完整指示執行

## 匹配規則（優先序）

1. **精確 name**：用戶輸入完整 command name（如 `debug`）→ 直接匹配
2. **關鍵字**：`錯誤` / `error` → `debug`；`探索` → `explore`
3. **歧義處理**：多個 command 匹配時，列出選項讓用戶選擇，不猜測

## Agent 調度

command 指示調度特定 agent 時：
1. 讀取 `.claude/agents/<agent-name>.md`
2. 採納該 agent 的全部職責、原則、輸出格式
3. 完成 agent 任務後回到原有角色

## 常用範例

| 觸發 | 路由到 |
|------|--------|
| `$skill-tool debug` | `.claude/commands/debug.md` |
| `$skill-tool explore` | `.claude/commands/explore.md` |
| `$skill-tool verify` | `.claude/commands/verify.md` |
| `$skill-tool scope` | `.claude/commands/scope.md` |
| `$skill-tool architecture` | `.claude/commands/architecture.md` |
| `$skill-tool demo` | `.claude/commands/demo.md` |
| `$skill-tool git-merge` | `.claude/commands/git-merge.md` |
| `$skill-tool disk-cleanup` | `.claude/commands/disk-cleanup.md` |
