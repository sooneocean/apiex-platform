# Orchestrator 行為規範

> 本文件定義 **Claude 主對話上下文**在管理 SOP 流程時的行為規範。不是可透過 Task 啟動的 subagent。
> 用途：context recovery 恢復進度、Gate 控制參考、Agent 調度依據。

## 核心職責

1. **需求識別**：判斷用戶輸入是否為需求，自動啟動 SOP
2. **流程調度**：管理 S0~S7 的自動推進與 Gate 控制
3. **Agent 分派**：根據任務性質選擇並調度專家 Agent
4. **Context 管理**：維護 SDD Context 完整性與傳遞
5. **Context 恢復**：對話開始或壓縮後，掃描並恢復進行中的 SOP

> Gate 策略、Spec Mode、Agent 調度表見 `.claude/references/sop-rules-detail.md`
> SDD Context v2.6.0 schema 見 `.claude/references/sdd-context-schema.md`

## SDD Context 恢復機制

> 對話開始時、context compaction 後、或用戶輸入「進度?」時，**必須**執行恢復掃描。

### 掃描流程

```bash
# Quick 與 Full Spec 統一路徑掃描
for f in dev/specs/*/sdd_context.json; do
  jq -r '.sdd_context | select(.status == "in_progress") | "\(.feature) | \(.current_stage) | \(.spec_mode // "unknown") | \(.work_type // "unknown") | \(.work_type_revised // "-") | \(.last_updated)"' "$f" 2>/dev/null
done
```

### 恢復後行為

1. 讀取 `sdd_context.json` 完整內容
2. 找到第一個 `pending` 或 `in_progress` 的 stage
3. 顯示恢復摘要（含 work_type；若存在 `work_type_revised` 則一併顯示，格式：`work_type: {original} → {revised}`）
4. 調用對應 Skill，將 sdd_context JSON 作為 `$ARGUMENTS` 傳入
5. **推進責任**：由各 Skill 自己負責更新 `current_stage`

## 執行模式

> 智慧調度協議（意圖路由、狀態機、安全中斷）見 `.claude/references/conductor-protocol.md`

### Autopilot 模式（預設）

```
S0 需求討論（requirement-analyst）
  🔴 停！確認 brief_spec（唯一硬門）
       │
S1 → S2 → S3📋摘要 → S4 → S5 → S6 → S7✅ 全自動
  安全閥：S5 P0 中斷 / S4↔S5 3x / S6 3x
```

S0 確認後，Orchestrator 自動鏈式推進 S1~S7。每個 Skill 完成後讀取 sdd_context，依狀態機調用下一個 Skill。

### Semi-Auto 模式

```
S0 需求討論（requirement-analyst）
  🔴 停！確認 brief_spec
       │
S1 分析 → S2 Spec Review → S3 規劃（自動推進區）
  🔴 停！確認執行計畫
       │
S4 實作 → S5 審查（自動推進區）
  ├── ✅ 通過 → 🟡確認 → S6 測試 → 🟡確認 → S7 提交
  ├── ⚠️ P1 → 回 S4（最多 3 次）
  └── 🔴 P0 → 回 S1
```

### Manual 模式

每個階段都需要用戶明確輸入指令才會推進。

## Gate 控制邏輯

| 轉換 | Autopilot（預設） | Semi-Auto | Manual |
|------|-------------------|-----------|--------|
| →S0 | 🟢 自動 | 🟢 自動 | 🟢 自動 |
| S0→S1 | 🔴 **必停** | 🔴 **必停** | 🔴 必停 |
| S1→S2 | 🟢 自動 | 🟢 自動 | 🔴 必停 |
| S2→S3 | 🟢 自動 | 🟢 自動 | 🔴 必停 |
| S3→S4 | 📋 摘要通知 | 🔴 **必停** | 🔴 必停 |
| S4→S5 | 🟢 自動 | 🟢 自動 | 🔴 必停 |
| S5→S6 | 🟢 自動 | 🟡 確認 | 🔴 必停 |
| S6→S7 | 🟢 自動 | 🟡 確認 | 🔴 必停 |
| S7 完成 | 🟢 auto commit | 🟡 確認 | 🔴 必停 |

### 模式切換

| 指令 | 效果 |
|------|------|
| 「不要 autopilot」「手動模式」 | → Semi-Auto |
| 「全手動」 | → Manual |
| 「autopilot」「自動模式」 | → Autopilot |

切換時更新 `sdd_context.execution_mode`，從當前階段繼續。

### Auto-Chain 協議（Autopilot 專用）

每個 Skill 完成後，Orchestrator 執行：
1. 讀取 sdd_context.json
2. 檢查 `execution_mode`
3. Autopilot → 依狀態機判斷下一步 → 自動調用下一個 Skill
4. Semi-Auto → 依上方 Gate 表決定停或繼續
5. Manual → 停下等用戶指令

### 轉場摘要標準

🔴必停 / 🟡確認 Gate 展示轉場訊息時，**必須**包含：

1. **下一階段全名**（如「S6 測試」而非只說「測試」）
2. **執行範圍清單**（條列該階段會做的所有事項）
3. **用戶操作指引**（輸入什麼繼續、什麼情況可調整）

🟢自動 Gate 不需要展示（LLM 不會停下來），但 Skill 內部仍記錄轉場。

> 各 Skill 的 Gate 區段已內建下一階段範圍描述，Orchestrator 展示時直接引用，禁止自行精簡或省略項目。

### Context 壓縮檢查點

每個 SOP 階段完成時，Orchestrator **必須**評估是否建議 `/compact`：

| 階段結束 | 壓縮優先級 | 原因 |
|---------|----------|------|
| S1 完成 | 🔴 高 | codebase-explorer 大量 Read/Grep 產出 |
| S4 完成 | 🔴 高 | 實作階段 tool call 密集、diff 龐大 |
| S6 完成 | 🟡 中 | 測試輸出量視 TC 數而定 |
| S0/S2/S3/S5 完成 | 🟢 低 | 產出較精簡，視情況判斷 |

**執行規則**：
1. 🔴高 優先級階段結束時，在 Gate 轉場訊息中**主動附帶** compact 建議
2. 附帶格式：`💡 本階段產出已持久化至 SDD Context，建議執行 /compact 釋放上下文空間。`
3. 用戶可忽略建議直接繼續（不阻斷流程）
4. 如果用戶執行 /compact，`sop-compact-reminder.sh` 會自動恢復 SOP 狀態

### 回饋迴路處理

- **P1 → 回 S4**：記錄問題 → 原 Agent 修復 → 重進 S5（最多 3 次）
- **P0 → 回 S1**：記錄根因 → 重新分析+規劃 → 🔴停確認
- **S6 缺陷**：debugger 診斷 + 實作 Agent 修復 → 重測（最多 3 次）

## Worktree 隔離（Opt-in）

- **觸發**：用戶在 S0 說「worktree」或「隔離」
- **S0→S1**：確認後 `EnterWorktree(name: "{feature}")` → 後續 S1~S7 在 worktree 內執行
- **S7 完成**：觸發 branch completion 選項（merge/PR/保留/丟棄）
- **預設**：不建立 worktree，用戶需明確要求

## 已知限制

| 限制 | 緩解 |
|------|------|
| 多 SOP 並存 | 每個 SOP（含 Quick）有獨立 spec_folder，可多視窗並行 |
| Context 壓縮 | SDD Context 持久化保留關鍵狀態 |
| Quick 模式開銷 | 用戶可說「直接修」跳過 SOP |

## 安全規則

- 讀取/分析：自動；寫入：S3 確認後；破壞性操作：三次確認；異常：自動調度 debugger
