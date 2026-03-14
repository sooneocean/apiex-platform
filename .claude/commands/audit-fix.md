---
description: "Audit-Fix 迴圈 — Codex 審計 spec vs codebase 差距，再 Codex 修復。可反覆觸發持續收斂。觸發：「audit fix」「審計修復」「codex 審計」「找問題修」「audit-fix」"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task
argument-hint: "<spec 目錄路徑>"
---

# /audit-fix — Codex 審計 + 修復迴圈

> Codex 審計 → Claude 解析排序 → Codex 修復 → 產出 diff 摘要。
> 設計成可反覆手動觸發，每次跑都會重新審計、修復，直到收斂。

## 環境資訊
- 當前分支: !`git branch --show-current`
- Codex 版本: !`codex --version 2>/dev/null || echo "NOT FOUND"`

## 輸入
- Spec 目錄路徑：$ARGUMENTS
- 若無引數，提示用戶提供 `dev/specs/{folder}/` 路徑
- 若引數為 `latest` → Glob 找最新的 `dev/specs/*/s1_dev_spec.md`

---

## 硬性規則（MUST）

1. **審計必須經過 Codex**。不可自己審自己。
2. **修復必須經過 Codex**。不可自己改自己審計出的問題（交叉原則）。
3. **每次觸發只跑一輪**（audit → fix）。用戶可反覆觸發直到滿意。
4. **修復保守**。只修 audit 指出的問題，不順手「改善」其他部分。
5. **不建立新 SOP**。直接在當前分支修復，不走 S0~S7 管線。
6. **不刪除檔案**。修復只能新增或修改。
7. **Session 紀錄追蹤**。每次執行產出 session 紀錄到 `{spec_folder}/audit-fix/`。

---

## 流程

### Phase 0：初始化

```bash
SPEC_FOLDER="$ARGUMENTS"  # e.g., dev/specs/2026-03-01_1_feature-name
SESSION_TS=$(date +%Y%m%d_%H%M%S)
SESSION_DIR="$SPEC_FOLDER/audit-fix/$SESSION_TS"
mkdir -p "$SESSION_DIR"
```

讀取必要 spec 檔案確認存在：
- `{spec_folder}/s0_brief_spec.md`（必須）
- `{spec_folder}/s1_dev_spec.md`（必須）
- `{spec_folder}/sdd_context.json`（必須）
- `{spec_folder}/s1_api_spec.md`（若存在）

### Phase 1：Codex 審計

#### 1.1 組裝審計材料

讀取所有 spec 檔案，組裝成 `$SESSION_DIR/audit-input.md`：

```markdown
# Spec Audit Task

你是本專案的 Spec vs Codebase 審計員。嚴格比對以下 spec 定義與實際程式碼的一致性。
專案技術棧和規範請參照 CLAUDE.md 和 AGENTS.md。

## 審計範圍

**逐項檢查以下維度**：

### D1: Frontend（前端 UI + 狀態管理）
- scope_in 中每個前端項目 → 找對應實作
- UI 元件、狀態管理、路由是否完整
- API 呼叫是否符合專案規範

### D2: Backend（API + Service + Controller）
- scope_in 中每個後端項目 → 找對應實作
- Endpoint 是否存在、HTTP method 正確
- Service 方法是否實作了 spec 定義的邏輯

### D3: Database（Schema + Migration + Entity）
- spec 定義的 table/column/index 是否在 Entity 和 Migration 中存在
- FK 關係是否正確

### D4: User Flow（端到端鏈路）
- 從 spec 的 user flow / 流程圖，追蹤關鍵路徑是否全程貫通
- 前端觸發 → 狀態管理 → API → Controller → Service → 資料層 → Response → UI 更新

### D5: Business Logic（異常處理 + 約束）
- spec 的 edge case / 約束條件 → code 中有對應 guard/validation
- DTO 跨層一致性

### D6: Test Coverage
- spec 的 acceptance_criteria → 對應 test case 存在
- 關鍵路徑（金錢/安全）必須有 test

## 輸出格式

對每個發現的問題，產出以下格式：

```
### [SEVERITY] [DIMENSION] Finding ID

**問題**: 一句話描述
**Spec 來源**: spec 中的哪個段落/要求
**Code 位置**: file:line（找到的位置）或「未找到」
**建議修復**: 具體建議（改哪個檔案、加什麼邏輯）
```

SEVERITY: P0（阻斷）、P1（重要）、P2（建議）
DIMENSION: D1~D6

最後附上摘要：
```
## 摘要
- P0: {n} 項
- P1: {n} 項
- P2: {n} 項
- 總計: {n} 項
```

## Spec 內容

{s0_brief_spec.md 完整內容}

---

{s1_dev_spec.md 完整內容}

---

{s1_api_spec.md 完整內容（若存在）}
```

#### 1.2 呼叫 Codex 審計

```bash
codex exec -s workspace-write \
  -o "$SESSION_DIR/audit-results.md" \
  "Read the file at $(pwd)/$SESSION_DIR/audit-input.md and perform the spec audit as instructed. Search the actual codebase files to verify each spec item. Output findings in the exact format specified. Be thorough — check every scope_in item."
```

> **注意**：
> - 不加 `-C`，讓 Codex 在專案根目錄執行
> - 不加 `-m`，使用 Codex 預設模型
> - 用**絕對路徑**

**Fallback**：如果 exit code != 0 或輸出 <200 bytes 或超時 180 秒：
```
⚠️ Codex 審計失敗（原因：{error}）
   使用 Claude spec-audit 引擎替代。
```
用 Claude 內建的 6-Agent spec-audit 引擎（讀取 `.claude/commands/spec-audit.md` 邏輯）作為 fallback。

### Phase 2：解析審計結果

1. 讀取 `$SESSION_DIR/audit-results.md`
2. 解析 findings：
   - 用 regex 提取每個 `### [P0|P1|P2]` finding
   - 分類：`code_fix`（需改 code）、`spec_fix`（spec 有誤）、`test_fix`（缺 test）
   - 按 P0 → P1 → P2 排序
3. 產出 `$SESSION_DIR/gap-list.json`：

```json
{
  "audit_id": "AF-{SESSION_TS}",
  "total": 0,
  "p0": 0, "p1": 0, "p2": 0,
  "gaps": [
    {
      "id": "AF-001",
      "severity": "P1",
      "dimension": "D2",
      "type": "code_fix",
      "description": "...",
      "spec_source": "...",
      "code_location": "file:line",
      "fix_suggestion": "..."
    }
  ]
}
```

4. 顯示摘要面板：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Audit 完成
   P0: {n}  P1: {n}  P2: {n}  總計: {n}
   code_fix: {n}  spec_fix: {n}  test_fix: {n}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

5. **零問題短路**：若 P0=P1=P2=0 → 跳到 Phase 4（無需修復）。

### Phase 3：Codex 修復

> 分批處理：每批最多 5 個相關 gap。先 P0，再 P1，最後 P2。
> `spec_fix` 類型不修（spec 問題需人工決策），只處理 `code_fix` 和 `test_fix`。

#### 3.1 產生修復指令

對每一批 gaps，組裝 `$SESSION_DIR/fix-batch-{N}.md`：

```markdown
# Code Fix Task (Batch {N})

你是本專案的修復工程師。以下是 spec audit 發現的問題，請逐個修復。
專案規則請參照 CLAUDE.md 和 AGENTS.md 中定義的 coding style 和技術棧規範。

## 待修復問題

{每個 gap 的完整資訊：description + spec_source + code_location + fix_suggestion}

## 修復原則
- 只修指出的問題，不改其他程式碼
- 新增 test 時放在正確的 test 目錄
- 不刪除檔案
- 修復後確認 build 不會壞（檢查 import、型別）
```

#### 3.2 呼叫 Codex 修復

```bash
codex exec -s workspace-write \
  -o "$SESSION_DIR/fix-result-{N}.md" \
  "Read the file at $(pwd)/$SESSION_DIR/fix-batch-{N}.md and fix all listed issues. For each issue, modify the actual source files. After fixing, list all files you changed and what you changed."
```

**Fallback**：Codex 失敗 → 用 Claude Task(model: "opus") 替代：
```
Task(
  subagent_type: "general-purpose",
  model: "opus",
  prompt: "讀取 $SESSION_DIR/fix-batch-{N}.md 並修復所有列出的問題。修復後列出所有變更的檔案和內容。"
)
```

#### 3.3 記錄修復結果

每批完成後：
- 讀取 `fix-result-{N}.md`，提取變更的檔案清單
- 追加到 `$SESSION_DIR/fix-log.md`

顯示進度：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 Batch {N}/{total} 修復完成
   修復: {n} 項  |  跳過(spec_fix): {n} 項
   變更檔案: {file_list}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 4：結果報告

顯示本次 audit-fix 總結：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Audit-Fix 結果 [{SESSION_TS}]
   Spec: {spec_folder}

   🔍 審計發現: {total} 項
      P0: {n}  P1: {n}  P2: {n}

   🔧 修復完成: {fixed} 項
      code_fix: {n}  test_fix: {n}

   ⏭️ 跳過: {skipped} 項
      spec_fix（需人工決策）: {n}

   📁 Session: {SESSION_DIR}

   💡 下一步:
      - 重新觸發 `/audit-fix {spec_folder}` 驗證修復效果
      - 手動處理 spec_fix 類型的問題
      - `git diff` 檢查變更是否合理
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

寫入 session 紀錄到 `$SESSION_DIR/session-summary.md`。

### Phase 5：Diff 快照

```bash
# 記錄本次變更的 diff
git diff > "$SESSION_DIR/changes.diff"
git diff --stat > "$SESSION_DIR/changes-stat.txt"
```

---

## 與現有 Skill 的關係

| Skill | 用途 | 差異 |
|-------|------|------|
| `/spec-audit` | 6-Agent 深度審計 | 只審不修 |
| `/spec-converge` | Spec 文字收斂 | 只修 spec，不改 code |
| `/audit-fix` | 審計 + 修復 code | 審計後直接修 code/test |
| `/code-review` | Code 品質審查 | 不對照 spec |

## 使用範例

```bash
# 審計修復指定 feature
/audit-fix dev/specs/2026-03-01_1_feature-name

# 審計修復最新 spec
/audit-fix latest

# 反覆執行直到收斂
/audit-fix dev/specs/2026-03-01_1_feature-name  # 第 1 次
/audit-fix dev/specs/2026-03-01_1_feature-name  # 第 2 次（驗證）
/audit-fix dev/specs/2026-03-01_1_feature-name  # 第 3 次（應該零問題）
```
