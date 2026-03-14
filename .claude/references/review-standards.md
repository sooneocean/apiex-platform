# Spec & Code Review 審查標準

> 本檔案為統一審查標準，涵蓋 Spec / Code / Test 三類審查。
> 用於：`review-dialogue.md` Context Assembly、`spec-review` / `code-review` 參考。

## 審查範圍規則

| 文件 | 角色 | 說明 |
|------|------|------|
| S1 dev_spec | **審查目標**（Spec Review） | 主要審查對象 |
| git diff + source | **審查目標**（Code Review） | 主要審查對象 |
| S0 brief_spec | **背景參考** | 用於對照需求是否被涵蓋，不對 S0 提 P0/P1 |
| SDD Context | **上下文** | 用於理解階段進度與決策脈絡 |

---

## Spec Review 審查項目

### 1. 完整性
- 每個任務都有可測試的 DoD
- 驗收標準使用 Given-When-Then，覆蓋 happy + error path
- 任務依賴關係清楚、粒度合理
- 涵蓋所有 S0 成功標準
- 技術決策有理由、有替代方案考量

### 2. 技術合規
- Data Flow 遵循專案既有的分層架構
- 各層職責清晰，不越界
- 命名與既有 codebase 風格一致

### 3. Codebase 一致性
- 提到的 class/method/endpoint 名稱存在或明確標為新建
- endpoint 路徑與路由定義一致
- DB 表/欄位名稱與現有 schema 一致
- 未違反已知架構約束

### 4. 風險與影響
- 影響範圍（impact_scope）完整列出
- 回歸風險、相依關係、安全性影響、效能影響已評估

### 5. S0 成功標準對照
- 每條成功標準可追溯到任務/驗收標準
- 無遺漏、無超出 scope_out

---

## Code Review 審查項目

### 1. 架構合規
- 各層職責清晰，業務邏輯在正確的層
- 遵循專案既有的分層架構模式

### 2. 命名慣例
- 遵循專案指定的命名規範
- 檔案/目錄命名與既有結構一致

### 3. DB 安全
- 使用 parameterized queries（防 SQL injection）
- 軟刪除遵循專案慣例
- 適當的 index 設計

### 4. 安全性
- 敏感資料不硬編碼、.env 不入 Git
- 輸入驗證完整
- 認證端點受適當保護
- 不洩漏 stack trace

### 5. 測試品質
- 測試覆蓋 happy + error path
- 外部服務使用 mock
- 測試命名清楚表達測試意圖

### 6. 效能
- 無 N+1 查詢
- 大量資料有分頁
- 適當使用 index

---

## Test Review 審查項目

### 1. 測試覆蓋
- 每個任務的 DoD 有對應的測試案例
- 涵蓋 happy path + error path
- 關鍵業務邏輯有獨立測試

### 2. 測試品質
- 遵循專案測試框架規範
- DB 測試使用隔離環境
- 外部服務使用 mock
- 測試命名清楚表達測試意圖

### 3. 失敗分析
- 測試失敗原因明確（非 flaky / 環境問題）
- 失敗測試的根因追溯到具體 source code 位置
- 修正後重跑驗證確實解決問題

### 4. 驗收標準對照
- 每條驗收標準可追溯到至少一個測試案例
- 未覆蓋的驗收標準明確標記（含原因）

---

## 嚴重度判定

| 等級 | 定義 |
|------|------|
| **P0** | 阻斷：安全漏洞、資料遺失、架構根本錯誤、需求理解偏差 |
| **P1** | 重要：邏輯錯誤、缺驗證、效能瓶頸、不符規範、DoD 不可測試 |
| **P2** | 建議：命名風格、註解品質、可讀性、最佳實踐 |

## 問題分類

| Category | 說明 |
|----------|------|
| `security` | SQL injection、XSS、未驗證端點 |
| `logic` | 業務邏輯錯誤、計算錯誤、邊界條件 |
| `architecture` | 架構違規（層級混亂、職責不清） |
| `naming` | 命名不符慣例 |
| `performance` | N+1、缺 index、timeout |
| `compliance` | 不符 spec/DoD 要求 |
| `completeness` | 缺少必要實作（Spec Review） |
| `consistency` | 不符既有 codebase 風格 |

## 輸出格式

```markdown
## P0 問題（必須修正）
[逐條列出，每條包含：問題、位置、影響、建議修正]

## P1 問題（需修正）
[逐條列出]

## P2 建議（不阻擋）
[逐條列出]

## 整體評估
[通過 / 需修正 / 重大問題]
```

全部使用**繁體中文**輸出。
