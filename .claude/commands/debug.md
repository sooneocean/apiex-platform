---
description: "Debug 輔助 - 針對錯誤進行根因分析與修復建議。觸發：runtime 錯誤、build 失敗、測試失敗。不用於 lint warnings 或 style 建議。"
allowed-tools: Read, Grep, Glob, Bash, Task, mcp__sequential-thinking__sequentialthinking, mcp__genaiToolbox__execute_sql, mcp__genaiToolbox__show_table_structure
argument-hint: "<錯誤訊息 | 檔案路徑 | 元件名稱>"
---

# Debug 問題排查

## 環境資訊
- 當前分支: !`git branch --show-current`
- 最近變更: !`(git diff --name-only HEAD~3 2>/dev/null || echo "(no recent changes)") | head -10`

## 分析目標
$ARGUMENTS

---

## Agent 調度

**本 Skill 調度**：`debugger`（涉及 DB 時額外調度 `sql-expert`）

```
Task(
  subagent_type: "debugger",
  prompt: "診斷以下問題：\n\n{錯誤描述}\n\n使用 sequential-thinking 進行系統化根因分析，產出問題摘要、根因分析、修復方案與驗證步驟。",
  description: "Debug 錯誤診斷"
)
```

---

## 診斷流程

1. **問題定位**：Flutter 前端 / .NET 後端 / 資料庫 / 整合層
2. **資料收集**：完整錯誤訊息、Stack trace、相關日誌、重現步驟
3. **根因分析**：sequential-thinking 系統化分析 → 列出假設 → 排除 → 確認根因
4. **修復方案**：具體修改建議 + 程式碼片段 + 替代方案
5. **驗證步驟**：如何確認修復有效

---

## 常見問題速查

### Flutter

| 錯誤 | 原因 | 方向 |
|------|------|------|
| `Null check operator` | 空值未處理 | 加入空值檢查 |
| `setState() after dispose()` | 生命週期問題 | mounted 檢查 |
| `RenderFlex overflowed` | UI 溢出 | Flexible/Expanded |
| `401 Unauthorized` | Token 過期 | 檢查 AuthInterceptor |

### .NET

| 錯誤 | 原因 | 方向 |
|------|------|------|
| `NullReferenceException` | 空值未處理 | 空值檢查 |
| `DbUpdateException` | DB 約束違反 | 檢查 Entity 關聯 |
| `InvalidOperationException` | 狀態不正確 | 檢查業務邏輯 |
| `AuthenticationException` | JWT 問題 | 檢查 Token 配置 |

### 資料庫

| 問題 | 原因 | 方向 |
|------|------|------|
| 查詢慢 | 缺少索引 | 分析執行計畫 |
| 資料不一致 | 事務問題 | 檢查隔離層級 |
| 連線失敗 | 配置錯誤 | 檢查連線字串 |
