---
description: "清理 AI 工具 session 殘留檔案。觸發：「清理磁碟」、「disk cleanup」、「清 session」、「clean sessions」"
allowed-tools: Bash, Read, Glob
---

# /disk-cleanup — AI 工具 Session 殘留清理

> 掃描並清理 AI 工具（Codex、Claude、Gemini）產生的暫存 session 檔案。
> 安全分級制度，逐級確認後才刪除。

## 環境資訊
- 當前日期: !`date +%Y-%m-%d`
- 磁碟使用: !`df -h ~ | tail -1`

---

## 掃描目標

| 路徑 | 說明 | 類型 |
|------|------|------|
| `~/.codex/sessions/` | Codex CLI session 紀錄 | AI session |
| `~/.codex/log/` | Codex CLI 執行日誌 | AI log |
| `~/.claude/projects/` | Claude Code 專案快取 | AI session |
| `~/.gemini/` | Gemini CLI 快取 | AI session |
| `/tmp/adversarial-review/` | 對抗式審查暫存（R1/R2/R3） | SOP 暫存 |
| `/tmp/claude-spec-*` | Spec 收斂暫存 | SOP 暫存 |

---

## 安全分級

| 等級 | 條件 | 行為 |
|------|------|------|
| Safe | 最後修改 > 30 天 | 列出後批量刪除（需用戶確認一次） |
| Confirm | 最後修改 7~30 天 | 逐項列出，需用戶逐項或批量確認 |
| Don't touch | 最後修改 < 7 天，或關聯 `in_progress` SOP | 僅顯示，不提供刪除選項 |

### in_progress SOP 保護

掃描 `dev/specs/*/sdd_context.json`，提取所有 `status: "in_progress"` 的 `spec_folder`。
若 `/tmp/adversarial-review/` 下的 session 在 sdd_context 中被引用 → 標記為 Don't touch。

---

## 執行流程

### 1. 掃描

對每個掃描目標：
```bash
# 檢查目錄是否存在
if [ -d "$TARGET_PATH" ]; then
  # 統計檔案數和總大小
  FILE_COUNT=$(find "$TARGET_PATH" -type f 2>/dev/null | wc -l)
  TOTAL_SIZE=$(du -sh "$TARGET_PATH" 2>/dev/null | cut -f1)

  # 按修改時間分級
  SAFE=$(find "$TARGET_PATH" -maxdepth 1 -mindepth 1 -mtime +30 2>/dev/null | wc -l)
  CONFIRM=$(find "$TARGET_PATH" -maxdepth 1 -mindepth 1 -mtime +7 -mtime -30 2>/dev/null | wc -l)
  DONT_TOUCH=$(find "$TARGET_PATH" -maxdepth 1 -mindepth 1 -mtime -7 2>/dev/null | wc -l)
fi
```

### 2. 顯示摘要表

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Disk Cleanup 掃描結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| 路徑 | 檔案數 | 大小 | Safe | Confirm | Don't touch |
|------|--------|------|------|---------|-------------|
| ~/.codex/sessions/ | {n} | {size} | {n} | {n} | {n} |
| ~/.codex/log/ | {n} | {size} | {n} | {n} | {n} |
| ~/.claude/projects/ | {n} | {size} | {n} | {n} | {n} |
| ~/.gemini/ | {n} | {size} | {n} | {n} | {n} |
| /tmp/adversarial-review/ | {n} | {size} | {n} | {n} | {n} |
| /tmp/claude-spec-* | {n} | {size} | {n} | {n} | {n} |

總計可釋放（Safe + Confirm）：{total_size}
受保護（in_progress SOP）：{protected_count} 個 session

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3. 逐級刪除

#### Safe 層（30+ 天）

```
Safe 層（30+ 天，共 {n} 項，{size}）：
  - ~/.codex/sessions/20260101_* (5 sessions)
  - /tmp/adversarial-review/20260115_* (3 sessions)
  ...

是否刪除所有 Safe 層項目？[Y/n]
```

用戶確認後：
```bash
# 逐項刪除並記錄
rm -rf "$ITEM_PATH"
echo "$(date -Iseconds) DELETED $ITEM_PATH" >> /tmp/disk-cleanup-$(date +%Y%m%d).log
```

#### Confirm 層（7~30 天）

逐項列出，用戶可選擇：
- `Y` — 刪除此項
- `n` — 跳過此項
- `all` — 刪除所有 Confirm 層
- `skip` — 跳過整個 Confirm 層

```
Confirm 層（7~30 天，逐項確認）：

  [1] ~/.codex/sessions/20260210_143022/ (2.3MB, 16 天前)
      刪除？[Y/n/all/skip]

  [2] /tmp/adversarial-review/20260218_091500/ (1.1MB, 8 天前)
      刪除？[Y/n/all/skip]
```

#### Don't touch 層

僅顯示，不提供刪除選項：
```
Don't touch（< 7 天 / in_progress SOP）：
  - /tmp/adversarial-review/20260225_* (關聯 SOP: user-profile-update)
  - ~/.codex/sessions/20260224_* (3 天前)
  [不可刪除]
```

### 4. 完成報告

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Disk Cleanup 完成
   已刪除: {n} 項（{freed_size}）
   已跳過: {n} 項
   受保護: {n} 項
   清理日誌: /tmp/disk-cleanup-{date}.log
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 安全規則

- **永遠不刪除**專案源碼、spec 檔案、sdd_context.json
- **永遠不刪除** `~/.claude/` 的設定檔（只清 `projects/` 子目錄下的快取）
- **永遠不使用** `rm -rf /` 或任何根目錄操作
- 所有刪除操作記錄到 `/tmp/disk-cleanup-{date}.log`
- 刪除前必須顯示完整摘要表，用戶確認後才執行
