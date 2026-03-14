---
name: auto-skill
description: "自動化知識積累系統。在任務完成時主動詢問是否記錄經驗，建立跨技能記憶層。適用於所有需要記錄最佳實踐的任務。"
---

# Auto-Skill 自進化知識系統

> 原始專案：https://github.com/Toolsai/auto-skill
> 客製化版本，已移除自動修改全局規則的功能。

## 核心循環（執行時機：任務接近完成時）

### 1. 抽取關鍵詞
- 從當前對話抽取 3–8 個核心名詞/短語（去重、統一大小寫）
- 用於後續檢索知識庫

### 2. 判斷話題切換
當出現以下任一條件，視為話題切換：
- 明確轉折詞：「另外」「改成」「換成」「再來」「順便」
- 本回合關鍵詞與上回合差異 >= 40%
- 用戶明確要求新增/修改分類

### 3. 跨技能經驗讀取（如使用了其他 Skill）
若本回合使用了其他 Skill 或 Command：
1. 讀取 `experience/_index.json`
2. 若找到對應 ID，載入 `experience/skill-[id].md`
3. 在回覆中提示：`我已讀取經驗：skill-xxx.md`
4. 若沒有該技能經驗，標記為「待記錄」

### 4. 知識庫檢索（話題切換時）
若是話題切換或首次回合：
- 讀取 `knowledge-base/_index.json`
- 以關鍵詞匹配分類 `keywords`
- 載入匹配的分類檔案
- 在回覆中提示：`我已讀取知識庫：[分類名稱]`

### 5. 主動記錄（最重要！）

**觸發時機**：
- 任務明顯已完成且值得記錄
- 用戶表達滿意（「太棒了」「成功了」「解決了」）
- 用戶明確要求（「記錄一下」「把這個記下來」）

**執行步驟**：
1. **總結經驗**：一句話提煉本次解決方案
2. **判斷價值**：這個經驗下次能幫用戶省時間嗎？
3. **主動詢問**：
   > 「這次我們解決了 [問題描述]，我想把這個經驗記錄到知識庫，下次遇到類似問題時可以直接參考。你覺得可以嗎？」

4. **執行記錄**：
   - **跨技能經驗**：若使用了 Commands（如 /s3-plan）→ 寫入 `experience/skill-[id].md`，更新 `experience/_index.json`
   - **一般知識**：若為通用流程/偏好 → 寫入 `knowledge-base/[category].md`，更新 `knowledge-base/_index.json`

---

## 記錄判斷準則

**核心問題：這東西下次能讓用戶省時間嗎？**

### 應該記錄（knowledge-base）：
- ✅ 可重用的流程與決策步驟（如 S3 任務分波的邏輯）
- ✅ 高成本的錯誤與修正路徑（如 spec 檔案命名錯誤）
- ✅ 關鍵參數/設定/前置條件（如 Migration DEFAULT 值）
- ✅ 使用者偏好與風格規則
- ✅ 多次嘗試才成功的方案（含失敗原因與成功條件）
- ✅ 可套用的模板/清單/格式

### 不應記錄：
- ❌ 一問一答、沒有可重用流程
- ❌ 純概念解釋（沒有具體做法）
- ❌ 沒有具體上下文、不可復用的結論

### 應該記錄（experience）：
- ✅ 使用 Command 時踩到的坑與解法（如 /s3-plan 時的波次劃分技巧）
- ✅ 影響結果的關鍵參數或配置
- ✅ 可重用的模板/提示詞/工作流程
- ✅ 依賴或資產路徑
- ✅ 需要特定順序或技巧才成功的步驟

---

## 條目格式

### knowledge-base 條目格式
```markdown
## 🔧 [簡短標題]
**日期：** YYYY-MM-DD
**情境：** 一句話描述使用場景
**最佳實踐：**
- [重點 1]
- [重點 2] - 參數說明和調整指南
```

### experience 條目格式
```markdown
## 🔧 [問題/技巧標題]
**日期：** YYYY-MM-DD
**Command/Skill：** /s3-plan 或 skill-id
**情境：** 一句話描述本次問題
**解法：**
- 具體步驟 1
- 具體步驟 2
**關鍵檔案/路徑：**
- /path/to/file
**keywords：** keyword1, keyword2, keyword3
```

---

## 存儲路徑

- 知識索引：`knowledge-base/_index.json`（repo 根目錄）
- 知識內容：`knowledge-base/[category].md`
- 經驗索引：`experience/_index.json`（repo 根目錄）
- 經驗內容：`experience/skill-[id].md`

---

## 動態分類（僅 knowledge-base）

當用戶的問題不屬於現有分類時：
1. 建議創建新分類
2. 詢問用戶分類名稱和關鍵詞
3. 創建新的 `.md` 文件並更新 `_index.json`

---

## 使用範例

### 範例 1：S3 任務分波經驗

**觸發詞**：「GoBack 的 11 個任務分波規劃完成了」

**記錄詢問**：
> 「這次我們成功規劃了任務分波策略，Wave 1-5 的並行邏輯很清楚。我想把『任務分波的判斷準則』記錄到 sop-workflow 知識庫，下次 /s3-plan 可以直接參考。你覺得可以嗎？」

**記錄內容**（寫入 `knowledge-base/sop-workflow.md`）：
```markdown
## 🔧 S3 任務分波並行策略
**日期：** 2026-02-15
**情境：** /s3-plan 需要將任務分波並行執行
**最佳實踐：**
- Wave 1：無依賴的基礎任務（Entity + Model）
- Wave 2：依賴 Wave 1 的資料層（Migration + Repository）
- Wave 3：依賴 Wave 2 的邏輯層（Service）
- Wave 4：依賴 Wave 3 的 API 層（Controller + Tests）
- Wave 5：前端（可與 Wave 2-4 並行）
- 判斷準則：檢查任務依賴關係，無依賴者可並行
```

### 範例 2：Migration DEFAULT 值技巧

**觸發詞**：「Migration 加了 DEFAULT false，沒有 Lock Table」

**記錄詢問**：
> 「這次 Migration 使用 DEFAULT 值避免了 Table Lock，這是個重要的技巧。我想記錄到 dotnet-dev 知識庫。你覺得可以嗎？」

**記錄內容**（寫入 `knowledge-base/dotnet-dev.md`）：
```markdown
## 🔧 EF Core Migration 避免 Lock Table
**日期：** 2026-02-15
**情境：** 新增 NOT NULL 欄位到大表
**最佳實踐：**
- 使用 `.HasDefaultValue(false)` 或 `.HasDefaultValue(0)`
- MySQL 8.0+ 支援 Instant DDL，不會長時間 Lock
- 避免先 ADD COLUMN 再 UPDATE，改為一步到位
```

---

## 與 SDD Context 的關係

| 檔案 | 用途 | 更新頻率 | 內容類型 |
|------|------|---------|----------|
| **sdd_context.json** | 當前 SOP 狀態 | 每階段 | S0-S7 進度、任務狀態、輸出 |
| **knowledge-base/** | 可重用經驗 | 任務完成時 | 流程、技巧、最佳實踐 |
| **experience/** | Command 經驗 | 任務完成時 | /s0-s7 的專屬技巧和坑點 |

它們互補而不重複：
- `sdd_context.json`：當前專案的 SOP 進度（揮發性）
- `knowledge-base`：跨專案的通用知識（持久性）
- `experience`：Command 專屬經驗（持久性）

---

## 注意事項

1. **不自動修改 CLAUDE.md**：此版本已移除自動修改全局規則的功能
2. **手動觸發為主**：避免每回合都檢索增加 token 消耗
3. **輕量化記錄**：只在真正有價值時才記錄
4. **可檢索**：所有記錄都有關鍵詞索引，方便未來檢索

---

## 建議初始分類

<!-- ⚙️ CUSTOMIZE: 根據你的專案技術棧調整分類 -->

- `sop-workflow`：S0-S7 SOP 流程經驗
- `frontend-dev`：前端開發技巧
- `backend-dev`：後端開發技巧
- `git-workflow`：Git 工作流程
- `debugging`：除錯與問題排查
