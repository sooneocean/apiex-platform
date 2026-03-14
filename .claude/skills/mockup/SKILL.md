---
name: mockup
description: "Hi-fi HTML Mockup 原型。從 S0 畫面清單或用戶描述，產出響應式全色彩 HTML Mockup，搭配 brainstorm-server 即時預覽。觸發：mockup、原型、prototype、Hi-fi、畫長相、畫面設計、UI 原型。"
---

# Mockup — Hi-fi HTML 原型產生器

> 從 S0 畫面清單 + wireframe Screen ID 或用戶描述，產出響應式全色彩 HTML Mockup。
> 搭配 superpowers brainstorm-server 即時瀏覽器預覽，支援多輪迭代修改。
> **強制依賴 brainstorm-server**。未啟動時報錯引導。

## Phase 0：既有檔案偵測與整合（MUST — 不可跳過）

> SOP 啟動前用戶可能已在 brainstorm session 中畫過 mockup。此步驟偵測並整合既有成果。

1. 判斷 spec folder：有進行中 SOP → `dev/specs/{feature}/`，否則待定
2. 依序搜尋既有 mockup：
   - **a) Spec 目錄內**：`{spec_folder}/frontend/mockup.html`
   - **b) brainstorm-server session**：`ls -td .superpowers/brainstorm/*/ 2>/dev/null | head -1` → 檢查 session 內 `mockup.html`
3. **找到既有 mockup**：
   - 若來源是 brainstorm session → 複製到 `{spec_folder}/frontend/mockup.html`（`mkdir -p` 確保目錄存在）
   - 更新 `sdd_context.json`：`stages.s0.output.frontend_design.mockup_path`
   - 告知用戶：「偵測到既有 mockup.html，已整合到 spec 目錄。要在此基礎上迭代，還是重新生成？」
   - **迭代** → 跳到 Phase 5（即時預覽與迭代）
   - **重新生成** → 繼續正常流程
   - **跳過** → 結束
4. **未找到** → 繼續「模式偵測」正常流程

---

## 模式偵測

1. 檢查 `dev/specs/` 下是否有進行中的 SOP（`sdd_context.json` 存在且 `status == "in_progress"`）
2. **Pipeline 模式**：有 SOP 且 S0 已完成 → 讀取 `s0_brief_spec.md` + `frontend/wireframe.html` + `frontend/flowchart.html`
3. **Standalone 模式**：無 SOP 或用戶直接觸發 → 用 AskUserQuestion 詢問

---

## Phase 1: brainstorm-server 偵測

1. 尋找最新 session：`ls -td .superpowers/brainstorm/*/ 2>/dev/null | head -1`
2. 讀取 `{session}/.server.pid`，確認 process 活著（`kill -0 $pid`）
3. **在跑** → 記錄 session_dir，繼續 Phase 2
4. **沒跑** → 停止，告知用戶：

```
⚠️ mockup 需要 brainstorm-server 即時預覽。

啟動方式：
1. 開啟 superpowers brainstorming session（會自動啟動 server）
2. 或手動執行：
   ${CLAUDE_PLUGIN_ROOT}/lib/brainstorm-server/start-server.sh --project-dir $(pwd)

啟動後再次觸發 mockup。
```

---

## Phase 2: 色彩方案偵測

### 自動掃描 codebase

按優先順序偵測：

1. **Tailwind Config**：`tailwind.config.{js,ts,mjs,cjs}`
   - 讀取 `theme.colors` 和 `theme.extend.colors`
   - 提取 primary、secondary、accent、background、text 等語意色

2. **CSS Variables**：掃描 `**/*.{css,scss}` 中的 `:root { --color-* }` 或 `--*-color`
   - 提取變數名與色碼

3. **Design Tokens**：尋找 `tokens.json`、`design-tokens.json`、`theme.json`
   - 提取色彩區段

4. **UI Framework 偵測**：讀 `package.json` dependencies
   - `@mui/material` → Material Design 預設色盤
   - `antd` → Ant Design 預設色盤
   - `@chakra-ui/react` → Chakra 預設色盤
   - 其他 → 無預設

### 用戶確認

偵測到色彩時：
```
我從 codebase 偵測到以下色彩方案：

Primary:    #1976d2 (藍)
Secondary:  #dc004e (粉紅)
Background: #fafafa
Text:       #212121
Accent:     #ff9800

要直接使用，還是要調整？
```

未偵測到時：
```
沒偵測到 codebase 色彩方案。你偏好什麼風格？
A) 暖色系（橘/米/棕）
B) 冷色系（藍/灰/白）
C) 中性（灰階 + 單一強調色）
D) 深色模式（深底淺字）
E) 自訂（請描述）
```

用戶確認後，鎖定 CSS variables：

```css
:root {
  --mockup-primary: {color};
  --mockup-secondary: {color};
  --mockup-accent: {color};
  --mockup-bg: {color};
  --mockup-surface: {color};
  --mockup-text: {color};
  --mockup-text-secondary: {color};
  --mockup-border: {color};
  --mockup-font: {font-family};
  --mockup-radius: {border-radius};
}
```

---

## Phase 3: 畫面提取

### Pipeline 模式

1. 讀取 `s0_brief_spec.md` §8（UI 畫面清單）
2. 讀取 `frontend/wireframe.html` 中的 Screen ID（若存在）
3. 讀取 `frontend/flowchart.html` 中的 Screen ID 映射（若存在）
4. 提取每個畫面：Screen ID、名稱、主要元素、互動行為
5. 列出辨識結果，用 AskUserQuestion 確認：
   「我辨識到以下 {N} 個畫面需要 mockup，有漏的嗎？」

### Standalone 模式

1. AskUserQuestion：「要畫哪些畫面的 mockup？請描述畫面和主要元素。」
2. 整理畫面清單
3. 確認後進入生成

---

## Phase 4: HTML 生成

### 生成原則

1. **響應式**：Desktop(1280px) + Mobile(375px)，用 `@media (max-width: 768px)` 切換
2. **真實資料**：使用合理的中文樣本資料，非 Lorem ipsum
3. **全色彩**：套用 Phase 2 確認的 CSS variables
4. **完整元件**：按鈕、輸入框、卡片、列表、導航列、側邊欄 — 全部帶色彩和圓角
5. **色彩對應表**：HTML 底部附上色彩 swatch，方便開發參考

### HTML 結構

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{功能名稱} — Mockup</title>
  <style>
    :root {
      --mockup-primary: {偵測/確認的色彩};
      --mockup-secondary: ...;
      --mockup-accent: ...;
      --mockup-bg: ...;
      --mockup-surface: ...;
      --mockup-text: ...;
      --mockup-text-secondary: ...;
      --mockup-border: ...;
      --mockup-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --mockup-radius: 8px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--mockup-font);
      background: var(--mockup-bg);
      color: var(--mockup-text);
    }

    /* 響應式容器 */
    .mockup-container { max-width: 1280px; margin: 0 auto; padding: 40px; }

    /* 每個畫面 */
    .mockup-screen {
      background: var(--mockup-surface);
      border: 1px solid var(--mockup-border);
      border-radius: var(--mockup-radius);
      margin-bottom: 48px;
      overflow: hidden;
    }
    .mockup-screen-title {
      background: var(--mockup-primary);
      color: white;
      padding: 12px 20px;
      font-size: 16px;
      font-weight: 600;
    }
    .mockup-screen-body { padding: 24px; }

    /* Desktop sidebar layout */
    .layout-sidebar {
      display: grid;
      grid-template-columns: 240px 1fr;
      min-height: 600px;
    }
    .sidebar {
      background: var(--mockup-primary);
      color: white;
      padding: 20px;
    }
    .main-content { padding: 24px; }

    /* 元件樣式 — 全部用 CSS variables */
    .btn-primary {
      background: var(--mockup-accent);
      color: white;
      border: none;
      border-radius: var(--mockup-radius);
      padding: 10px 20px;
      font-size: 14px;
      cursor: pointer;
    }
    .btn-secondary {
      background: transparent;
      color: var(--mockup-text);
      border: 1px solid var(--mockup-border);
      border-radius: var(--mockup-radius);
      padding: 10px 20px;
      font-size: 14px;
    }
    .card {
      background: var(--mockup-surface);
      border: 1px solid var(--mockup-border);
      border-radius: var(--mockup-radius);
      padding: 16px;
      margin-bottom: 12px;
    }
    .input-field {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--mockup-border);
      border-radius: var(--mockup-radius);
      font-size: 14px;
      background: var(--mockup-bg);
    }
    .nav-bar {
      display: flex;
      align-items: center;
      padding: 12px 20px;
      background: var(--mockup-surface);
      border-bottom: 1px solid var(--mockup-border);
    }

    /* Mobile 適配 */
    @media (max-width: 768px) {
      .mockup-container { padding: 16px; }
      .layout-sidebar {
        grid-template-columns: 1fr;
      }
      .sidebar { display: none; } /* 或改為 hamburger */
    }

    /* 色彩對應表 */
    .color-palette {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--mockup-border);
    }
    .color-swatch {
      text-align: center;
      font-size: 12px;
    }
    .color-swatch .swatch {
      width: 80px;
      height: 40px;
      border-radius: var(--mockup-radius);
      margin-bottom: 4px;
    }

    /* 印刷 */
    @media print {
      .mockup-screen { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="mockup-container">
    <h1>{功能名稱} — Mockup</h1>
    <p style="color: var(--mockup-text-secondary); margin-bottom: 32px;">
      Hi-fi prototype | {N} screens | {YYYY-MM-DD} | Desktop + Mobile
    </p>

    <!-- 每個畫面一個 section -->
    <section class="mockup-screen" id="screen-S{N}">
      <div class="mockup-screen-title">S{N}: {畫面名稱}</div>
      <div class="mockup-screen-body">
        <!-- 依畫面需求組合元件，使用真實樣本資料 -->
      </div>
    </section>

    <!-- 更多畫面... -->

    <!-- 色彩對應表 -->
    <div class="color-palette">
      <div class="color-swatch">
        <div class="swatch" style="background: var(--mockup-primary);"></div>
        <div>Primary</div>
        <div>{色碼}</div>
      </div>
      <!-- 更多色票... -->
    </div>
  </div>
</body>
</html>
```

> **關鍵**：以上是骨架模板，實際每個畫面的 HTML 由 Claude 根據畫面需求即時生成。
> 重點是 CSS variables 統一、響應式 media queries、真實樣本資料。

---

## Phase 5: 即時預覽與迭代

1. 將生成的 HTML 寫到 brainstorm-server session dir：
   ```
   cp {spec_folder}/frontend/mockup.html {session_dir}/mockup.html
   ```
2. chokidar 偵測到新檔 → WebSocket 通知 → 瀏覽器自動 reload
3. 告知用戶：「mockup 已在瀏覽器中顯示，請檢視後給回饋。」
4. 用戶回饋（terminal 文字）→ 修改 HTML → 重新寫入 → 再次 reload
5. 重複迭代直到用戶說「OK」或「定稿」

### 迭代規則

- 每次修改只更新有變動的畫面，不重寫整份 HTML
- 保持 CSS variables 不變（除非用戶要求改色彩）
- 每次 reload 後等用戶回饋，不主動推進

---

## Phase 6: 定稿與存檔

### Pipeline 模式

1. 確保目錄存在：`mkdir -p dev/specs/{feature}/frontend/`
2. 寫入 `dev/specs/{feature}/frontend/mockup.html`
3. 更新 `sdd_context.json`：
   - `stages.s0.output.frontend_design.mockup_path` = `dev/specs/{feature}/frontend/mockup.html`
4. 通知：「mockup 已定稿並存檔。」

### Standalone 模式

1. 建立目錄：`mkdir -p dev/specs/{descriptive-name}/frontend/`
2. 寫入 `dev/specs/{descriptive-name}/frontend/mockup.html`
3. 通知存檔路徑

---

## 輸出格式

```
Mockup：{功能名}

色彩方案：{來源}（codebase 偵測 / 用戶指定）
├── Primary:   {色碼}
├── Accent:    {色碼}
└── Background: {色碼}

畫面清單：{N} 個 Screen

設計資訊
├── Screen 數量：{N} 個（S1~S{N}）
├── 版面：響應式 Desktop(1280px) + Mobile(375px)
├── HTML 檔案：{路徑}
└── 預覽：brainstorm-server（瀏覽器已自動刷新）

[請在瀏覽器檢視，回 terminal 給回饋]
```

---

## 安全規則

- 不修改任何專案程式碼
- 不修改 wireframe.html 或 flowchart.html
- Pipeline 模式下讀取 brief spec 為純讀取
- 不管理 brainstorm-server 生命週期

## Gate

- 定稿 → 存檔到 canonical path，結束
- 修改 → 繼續迭代（Phase 5 迴圈）
- 取消 → 不存檔，結束

> **本 Skill 與 wireframe 互補**。mockup 是 Hi-fi 彩色 HTML 原型，用於視覺設計探索；wireframe 是 Lo-fi 灰階草圖，用於佈局確認。wireframe 確認「在哪」，mockup 確認「長什麼樣」。
