---
description: "對話過場 - 整理當前對話上下文與下一步，用於跨視窗橋接。自動偵測 SOP 模式精簡輸出。"
allowed-tools: Read, Grep, Glob, Bash, TaskList
argument-hint: "[focus: 特定主題或重點]"
---

# 對話過場（Context Handoff）

## 環境資訊
- 當前分支: !`git branch --show-current`
- 當前時間: !`date '+%Y-%m-%d %H:%M'`

## 輸入
重點聚焦：$ARGUMENTS

---

## 任務流程

### 1. 取得 Session 資訊

```bash
PROJECT_DIR="$HOME/.claude/projects"
ENCODED=$(echo "$PWD" | sed 's|/|-|g')
TRANSCRIPT=$(ls -t "$PROJECT_DIR/$ENCODED/"*.jsonl 2>/dev/null | head -1)
SESSION_ID=$(basename "$TRANSCRIPT" .jsonl)
echo "Resume: claude --resume $SESSION_ID"
```

### 2. 偵測模式

檢查是否有進行中的 SOP：
```bash
# Quick 與 Full Spec 統一路徑
find dev/specs/ -name "sdd_context.json" -exec grep -l '"status": "in_progress"' {} \; 2>/dev/null
```

- **找到 sdd_context.json** → **SOP 模式**（精簡）
- **找不到** → **通用模式**（完整）

---

## SOP 模式（精簡）

> 核心原則：sdd_context.json 已持久化所有 SOP 狀態，新對話的 `sop-compact-reminder.sh` hook 會自動注入。
> handoff 只需要傳遞 **不在持久化裡的 delta**。

### 3S. 讀取 SDD Context 摘要

讀取 sdd_context.json，只提取：
- `feature`
- `current_stage`
- `spec_folder`

**不要**輸出完整 JSON — hook 會自動恢復。

### 4S. 回顧對話，提取 Delta

回顧本次對話內容，只提取 **不在 sdd_context.json / spec 檔案裡的資訊**：
- 用戶的口頭決策或偏好（未寫入 spec 的）
- 對話中發現的 gotcha / 注意事項
- 臨時的環境問題或 workaround
- 若無 delta → 寫「無額外 context，hook 自動恢復即可」

### SOP 模式輸出

```
## Resume
claude --resume {session_id}
```

```
繼續 {feature} {current_stage}
```

加上 delta notes（如有）：

```
## Delta（不在 sdd_context 裡的 context）
- {delta_1}
- {delta_2}
```

若無 delta：

```
無額外 context。新對話開啟後 hook 自動恢復 SOP 狀態，直接說「繼續」即可。
```

---

## 通用模式（完整）

> 無 SOP 時，需要完整的 context 橋接。

### 3G. 取得 Git 狀態

```bash
git branch --show-current
git diff --name-only HEAD 2>/dev/null
git diff --name-only --cached 2>/dev/null
git ls-files --others --exclude-standard 2>/dev/null
```

### 4G. 取得 TaskList 快照

使用 `TaskList` tool 取得任務狀態（如有）。

### 5G. 整理對話上下文

回顧對話內容，整理：做了什麼、關鍵決策、變更清單、未完成項目、下一步。

### 通用模式輸出

```
## Resume
claude --resume {session_id}
```

```markdown
請延續以下工作上下文：

## Session 資訊
- **前一個 Session**: `{session_id}`
- **分支**: `{branch_name}`
- **時間**: `{timestamp}`

## 對話摘要
{1-3 句話，只寫事實}

## 變更清單
| 操作 | 檔案 | 說明 |
|------|------|------|

## 下一步
1. {最優先}
2. {其次}

## 注意事項
- {限制、風險、未解決問題}（若無則省略此區塊）
```

---

## 輸出要點

- **SOP 模式**：不輸出完整 SDD Context JSON（hook 會恢復），只輸出 delta
- **通用模式**：摘要精準（1-3 句），變更清單完整，下一步可執行
- **兩種模式都必附 Session ID**
