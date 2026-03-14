---
name: wireframe-review
description: "PM/UIUX Review 版線框圖。基於 wireframe.html 產出給 PM 與設計師的 review 版本（移除技術標註、加入使用者視角敘事與導航提示）。觸發：wireframe-review、PM review、設計師版、review wireframe、UIUX review、給 PM 看、給設計師看。"
---

# Wireframe Review — PM / UIUX 設計師版線框圖

> 基於開發版 `wireframe.html`，產出適合 PM 與 UIUX 設計師閱讀的 review 版本。
> 移除技術標註（flow-ref、context-badge、API endpoint），改用使用者視角敘事。
> 加入 sticky 導航列、FA 分區、錨點跳轉、flow arrow 導航提示。
> **零 JavaScript** — 純靜態 HTML + inline CSS，瀏覽器直開即可分享。

## Phase 0：前置條件檢查（MUST — 不可跳過）

1. 判斷 spec folder：有進行中 SOP → `dev/specs/{feature}/`，否則待定
2. 檢查 `{spec_folder}/frontend/wireframe.html` 是否存在
3. **不存在** → 停止，告知用戶：
   ```
   wireframe-review 需要先有 wireframe.html。
   請先執行 /wireframe 產出開發版線框圖。
   ```
4. **已存在** → 繼續
5. 檢查 `{spec_folder}/frontend/wireframe-review.html` 是否已存在
   - **已存在** → 詢問「偵測到既有 wireframe-review.html，要覆蓋還是跳過？」

---

## Phase 1：來源分析

1. 讀取 `wireframe.html`，提取所有 Screen：
   - Screen ID、畫面名稱、FA 歸屬、狀態（新增/既有修改/不動）
   - 內容結構（元素清單）
   - `.annotation` 內容（將轉換為使用者視角敘事）
   - `.flow-ref` 內容（將轉換為 flow arrow）
2. 讀取 `flowchart.html`（若存在）：
   - 提取畫面間的導航關係（A → B 的路徑）
   - 用於生成 flow arrow 導航提示
3. 讀取 `s0_brief_spec.md` §8（若存在）：
   - 補充畫面描述和使用者故事

---

## Phase 2：轉換規則

### 移除項目（技術細節）

| 開發版元素 | 處理方式 |
|-----------|---------|
| `.annotation`（黃框技術標註） | 轉換為 `.design-note`（使用者視角敘事） |
| `.flow-ref`（藍色 flow 參照） | 轉換為 `.flow-arrow`（自然語言導航提示） |
| context-badge（login/register/bind） | 移除，改用文字描述不同使用情境 |
| API endpoint 路徑 | 完全移除 |
| `data-screen-id`、`data-fa` 屬性 | 完全移除 |
| 技術狀態標籤（ENUM 值） | 保留但改用人話：「新增」「修改」「大改」「不動」 |

### 新增項目（設計視角）

| 新增元素 | 說明 |
|---------|------|
| Sticky page-header | 白底固定頂部，含標題 + FA 色彩 pill 導航 |
| FA 分區標題 | 畫面按 FA 分組，每組有 `.fa-badge` 色彩標記 |
| `.design-note` | **白底邊框卡片**，放在 phone-frame 外面下方，使用者視角敘事 |
| `.flow-arrow` | accent 色箭頭導航（`::before` 偽元素 20px 水平線 + 文字） |
| 三層卡片結構 | label-bar（白底 + badge）→ phone-frame → design-note |
| Alert 去重 | 相同語意的 Alert 合併，非連續 ID（如 A1,A2,A3,A7,A8,A9） |
| Dialog 短屏 | Alert 用 `.phone-frame.short`（min-height:auto）+ dialog 結構 |

### 敘事轉換原則

```
開發版 annotation: → 點擊後：POST /api/auth/google → 成功導向 S2
Review 版 design-note:
  <strong>互動行為</strong>
  <ul>
    <li>用戶點擊 Google 登入按鈕</li>
    <li>系統顯示授權畫面，用戶授權後自動跳轉</li>
  </ul>
  <div class="flow-arrow">已有帳號 → 直接登入主頁 / 新用戶 → 進入註冊流程</div>
```

---

## Phase 3：HTML 生成

### CSS 變數系統

```css
:root {
  --pri: #343a40;           /* 主色 */
  --pri-text: #fff;         /* 主色文字 */
  --bg: #ffffff;            /* 表面背景 */
  --bg2: #f8f9fa;           /* 次要背景 */
  --border: #dee2e6;        /* 邊框 */
  --text: #212529;          /* 主文字 */
  --text2: #495057;         /* 次要文字 */
  --text3: #adb5bd;         /* 提示文字 */
  --input-border: #ced4da;  /* 輸入框邊框 */
  --accent: #1565c0;        /* 強調藍 */
  --danger: #dc3545;        /* 危險紅 */
  --success: #28a745;       /* 成功綠 */
  --warn: #ffc107;          /* 警告橘 */
}
body { background: #f1f3f5; } /* 頁面底色比 bg2 更深 */
```

### HTML 結構

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{功能名稱} — UI Wireframe Review</title>
  <style>
    /* CSS 變數 + 完整樣式（見下方元素清單） */
  </style>
</head>
<body>

  <!-- Sticky Header（白底） -->
  <div class="page-header">
    <h1>{功能名稱} — Wireframe Review</h1>
    <p class="subtitle">PM / UIUX Review 版 | {N} screens + {K} alerts | {YYYY-MM-DD}</p>
    <nav>
      <a href="#fa-a" class="fa-a">FA-A: {名稱}</a>
      <a href="#fa-b" class="fa-b">FA-B: {名稱}</a>
      <a href="#alerts" class="fa-alert">Alerts</a>
    </nav>
  </div>

  <!-- FA 分區 -->
  <div class="section" id="fa-a">
    <div class="section-head">
      <span class="fa-badge a">FA-A</span> {功能區名稱}
    </div>
    <p class="section-desc">{此功能區的使用者故事簡述}</p>
    <div class="grid">

      <!-- Screen Card = label-bar + phone-frame + design-note -->
      <div class="screen-card">
        <div class="label-bar">
          <span class="name">S{N}: {畫面名稱}</span>
          <span class="badge badge-new">新增</span>
        </div>
        <div class="phone-frame">
          <div class="status-bar">9:41</div>
          <div class="nav-bar">
            <span class="back">&larr;</span>
            {頁面標題}
          </div>
          <div class="content">
            <!-- UI 元素（同 wireframe 灰階元件） -->
          </div>
        </div>
        <div class="design-note">
          <strong>互動行為</strong>
          <ul>
            <li>用戶在此畫面可以 xxx</li>
            <li>點擊按鈕後會 yyy</li>
          </ul>
          <div class="flow-arrow">成功 → {目標畫面} | 失敗 → 顯示錯誤提示</div>
        </div>
      </div>

      <!-- 更多 Screen Card... -->
    </div>
  </div>

  <!-- Alert 區塊（去重） -->
  <div class="section" id="alerts">
    <div class="section-head">
      <span class="fa-badge alert">Alert</span> 系統提示與錯誤
    </div>
    <p class="section-desc">統一彈窗格式，以下為去重後的獨立 Alert。</p>
    <div class="grid">
      <div class="screen-card">
        <div class="label-bar">
          <span class="name">A{N}: {Alert 名稱}</span>
          <span class="badge badge-new">新增</span>
        </div>
        <div class="phone-frame short">
          <div class="dialog-bg">
            <div class="dialog">
              <h3>{標題}</h3>
              <p>{說明文字}</p>
              <button class="btn-pri">{按鈕}</button>
            </div>
          </div>
        </div>
        <div class="design-note">{觸發條件說明}</div>
      </div>
    </div>
  </div>

</body>
</html>
```

### 元素清單

| 元素 | CSS class | 說明 |
|------|-----------|------|
| **版面** | | |
| Sticky Header | `.page-header` | sticky top:0, z-100, 白底, border-bottom |
| FA Nav Pill | `nav a.fa-a` / `.fa-b` / `.fa-alert` | 圓角 pill，藍/綠/琥珀色 |
| Section | `.section` | padding:40px, max-width:1600px |
| Section Head | `.section-head` | 20px bold + `.fa-badge` |
| Screen Grid | `.grid` | flex wrap, gap:48px |
| **Screen Card** | | |
| Card 容器 | `.screen-card` | width:375px, flex column |
| Label Bar | `.label-bar` | 白底, border, **圓角上半**（12px 12px 0 0）, flex space-between |
| Status Badge | `.badge-new` / `.badge-mod` / `.badge-keep` | 綠/琥珀/灰 小標籤 |
| Phone Frame | `.phone-frame` | 375×667, 白底, **圓角下半**（0 0 12px 12px）, box-shadow |
| Phone Frame Short | `.phone-frame.short` | min-height:auto，用於 Alert/Dialog |
| **Phone 內部** | | |
| Status Bar | `.status-bar` | 44px, bg2, 顯示 "9:41" |
| Nav Bar | `.nav-bar` | 52px, 白底, back + title |
| Content | `.content` | flex:1, 白底, 20px 16px padding |
| **UI 元件** | | |
| Primary Button | `.btn-pri` | pri 底白字, 10px radius, 15px padding |
| Secondary Button | `.btn-sec` | 白底灰邊 |
| OAuth Button | `.btn-oauth` | 白底灰邊, flex row, 14px radius, `.ico` 圖標方塊 |
| Input Field | `.input` | 白底灰邊, 10px radius |
| Card | `.card` | 白底灰邊, 12px radius |
| Avatar | `.avatar` | 40px 圓形, bg2 |
| OTP Cell | `.otp-cell` | 48×56px, 2px 邊框, 10px radius |
| Provider Row | `.provider-row` | flex row, bottom border |
| Chip (bind) | `.chip-bind` | accent 邊框色 |
| Chip (unbind) | `.chip-unbind` | danger 邊框色 |
| Spinner | `.spinner` | CSS-only 旋轉（純視覺，不含動畫 — 靜態 review） |
| **設計標註** | | |
| Design Note | `.design-note` | **白底邊框**, 8px radius, **放在 phone-frame 外部下方** |
| Flow Arrow | `.flow-arrow` | accent 色, `::before` 20px×2px 水平線, 12px |
| **Dialog** | | |
| Dialog 背景 | `.dialog-bg` | rgba(0,0,0,.25) 遮罩 |
| Dialog | `.dialog` | 白底, 20px radius, max-width:320px |
| **Utility** | | |
| Gap | `.gap` / `.gap-lg` | 12px / 24px 間距 |

### 關鍵設計原則

1. **零 JavaScript**：純靜態 review 文件，不含任何 JS
2. **三層卡片**：label-bar（metadata）→ phone-frame（wireframe）→ design-note（rationale）
3. **design-note 在 frame 外**：設計備註不佔畫面空間，是附加說明
4. **白底 sticky header**：不搶視覺焦點，pill 導航有 FA 色彩區分
5. **FA 色彩系統**：FA-A 藍（#dbeafe）、FA-B 綠（#dcfce7）、Alert 琥珀（#fef3c7）
6. **Alert 去重**：相同語意合併，ID 可不連續（A1,A2,A3,A7,A8,A9）
7. **Dialog 短屏**：Alert 用 `.phone-frame.short` 免去多餘空白
8. **375×667 iPhone 8 比例**：與開發版 wireframe 一致

---

## 存檔

1. 寫入 `{spec_folder}/frontend/wireframe-review.html`
2. `open` 在瀏覽器中開啟
3. 不更新 `sdd_context.json`（衍生產出物，canonical 版本是 `wireframe.html`）

---

## 輸出格式

```
Wireframe Review：{功能名}

版本差異
├── 開發版 wireframe.html：技術標註、flow-ref、API 細節
└── Review 版 wireframe-review.html：使用者視角、設計備註、導航提示

設計資訊
├── Screen 數量：{N} 個
├── FA 分區：{M} 個（{FA 色彩標記}）
├── Alert 數量：{K} 個（去重後）
├── HTML 檔案：{路徑}
└── 瀏覽方式：已在瀏覽器開啟

可直接分享給 PM 和 UIUX 設計師。
```

---

## 安全規則

- 不修改 wireframe.html
- 不修改 flowchart.html
- 不修改任何專案程式碼
- 純讀取 brief spec

## Live Preview（可選）

若 superpowers brainstorm-server 已啟動，自動觸發瀏覽器 live-reload：

1. 尋找最新 session：`ls -td .superpowers/brainstorm/*/` 取第一個
2. 讀取 `{session}/.server.pid`，確認 process 活著（`kill -0 $pid`）
3. `cp {spec_folder}/frontend/wireframe-review.html {session}/wireframe-review.html`

**未啟動 → 完全跳過，不報錯。**

## Print 支援

```css
@media print {
  .page-header { position: static; }     /* 解除 sticky */
  .screen-card { break-inside: avoid; }  /* 卡片不跨頁 */
  body { background: #fff; }             /* 白底列印 */
}
```

## Gate

- 完成 → 存檔，結束
- 修改 → 調整敘事、排版或分組

> **與 wireframe 的關係**：wireframe 是開發者用的 canonical 版本（技術標註 + flow-ref），wireframe-review 是同一份設計的 PM/UIUX 版本（使用者視角 + 設計備註）。兩者共用同一組 Screen，只是表達方式不同。
