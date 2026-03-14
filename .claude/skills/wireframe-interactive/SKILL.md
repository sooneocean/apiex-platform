---
name: wireframe-interactive
description: "互動式 UX 原型。基於 wireframe + flowchart 產出可點擊互動的 HTML 原型（JavaScript 狀態機畫面切換、模擬互動、情境開關）。觸發：wireframe-interactive、互動原型、interactive prototype、可互動、UX 原型、interactive wireframe、互動體驗、可點擊原型。"
---

# Wireframe Interactive — 互動式 UX 原型

> 基於 `wireframe.html` + `flowchart.html`，產出可點擊互動的 HTML 原型。
> JavaScript 狀態機驅動畫面切換，模擬 OAuth / OTP / WebSocket 等互動。
> 情境模擬開關 + 快捷導航 + Breadcrumb 路徑追蹤。
> 零依賴（純 HTML + inline CSS + inline JS），瀏覽器直開即可體驗。

## Phase 0：前置條件檢查（MUST — 不可跳過）

1. 判斷 spec folder：有進行中 SOP → `dev/specs/{feature}/`，否則待定
2. 檢查 `{spec_folder}/frontend/wireframe.html` 是否存在
3. **不存在** → 停止，告知用戶：
   ```
   wireframe-interactive 需要先有 wireframe.html。
   請先執行 /wireframe 產出線框圖。
   ```
4. **已存在** → 繼續
5. 檢查 `{spec_folder}/frontend/wireframe-interactive.html` 是否已存在
   - **已存在** → 詢問「偵測到既有 wireframe-interactive.html，要覆蓋還是跳過？」

---

## Phase 1：流程圖分析

> 從 flowchart.html 和 s0_brief_spec.md 提取畫面轉移圖（State Transition Map）。

1. 讀取 `flowchart.html`，解析所有 Mermaid 圖表中的邊（edge）：
   - 節點 A → 節點 B：條件是什麼？
   - 哪些是使用者操作觸發的轉移？
   - 哪些是系統自動轉移？
2. 讀取 `wireframe.html`，提取所有 Screen ID 和互動元素
3. 讀取 `s0_brief_spec.md` §4 和 §8：
   - §4：流程步驟和分支邏輯
   - §8：每個畫面的互動描述
4. 建立狀態轉移表：

```
Screen     | Trigger          | Condition        | Target
-----------|------------------|------------------|--------
splash     | auto (2s delay)  | —                | login
login      | click Google     | —                | [OAuth popup]
login      | click OTP        | —                | phone-input
phone-input| OTP verified     | existing=true    | home
phone-input| OTP verified     | existing=false   | invite-code
```

5. 用 AskUserQuestion 確認：
   「我建立了以下 {N} 條狀態轉移，有漏的嗎？」
   - 也可以問：「要基於開發版還是 Review 版的視覺風格？」→ 預設 Review 版

---

## Phase 2：互動設計

### 核心架構：單一手機外框 + 畫面堆疊

```
body（深色 #1a1a2e）
├── .controls（控制面板 — 手機外部）
│   ├── 標題 + 說明
│   ├── .ctrl-row（情境開關）
│   ├── .ctrl-row（快捷按鈕）
│   └── #breadcrumb
└── .phone-wrap（375×812 iPhone X 黑色邊框）
    └── .phone-inner（白底 788px，圓角 30px）
        ├── .screen#s-{id}（absolute，一次只顯示一個）
        ├── .overlay#alertOverlay（z-index: 10）
        ├── .oauth-popup#oauthPopup（z-index: 20）
        └── .toast#toast（z-index: 30）
```

**關鍵**：所有畫面預先渲染在 DOM 中，用 `display:none` / `display:flex` 切換。不動態建立畫面。

### 狀態機

```javascript
const S = {
  screen: '{起始畫面}',     // 當前畫面 ID
  context: null,            // 'login' | 'register' | 'bind' — 決定同畫面不同行為
  provider: null,           // 'google' | 'apple' | 'email' | 'phone'
  existing: false,          // 情境開關：帳號是否已存在
  oldPhone: false,          // 情境開關：手機有舊帳號
  bound: new Set([...]),    // 已綁定的認證方式（Profile 頁用）
  history: [],              // 導航堆疊（breadcrumb 用）
  otpFilled: 0,             // OTP 已填格數
};
```

**Context-Driven Polymorphism**：同一個畫面（如 phone-input）根據 `S.context` 展現不同行為：
- `context='login'`：驗證後直接登入
- `context='register'`：驗證後進入註冊流程
- `context='bind'`：驗證後綁定到 Profile

`goTo(screenId, context)` 第二個參數傳入 context，對應 flowchart 中多條邊進入同一個節點的模式。

### Screen ID 命名

HTML 中每個畫面的 ID 格式：`s-{screen-id}`（小寫連字號）

```javascript
const SCREEN_NAMES = {
  'splash': 'Splash',
  'login': '登入頁面',
  'phone-input': '手機輸入',
  'otp': 'OTP 驗證碼',
  // ...
};
```

### 模擬互動類型

根據 flowchart 中的節點類型，自動選用對應的模擬互動：

| 節點類型 | 模擬互動 | 實作細節 |
|---------|---------|---------|
| OAuth 授權 | `.oauth-popup`（z-20） | 進度條 `loadBar` 1.5s → `handleOAuthResult()` 分支，可取消 |
| OTP 驗證 | `.otp-cell` 逐格填入 | `fillOtp(idx)` 漸進填充 + `.filled`/`.focus` class，驗證按鈕一鍵全填 |
| Email 等待 | spinner + 模擬按鈕 | 「📨 模擬：用戶點擊了驗證連結」手動觸發成功 |
| 確認彈窗 | `.overlay`（z-10）+ `.dlg` | 動態 `showAlertCustom(title, msg, buttons)` |
| Toast | `.toast`（z-30） | `showToast(msg)` 2.5s 自動消失 |
| 表單提交 | 按鈕 → 跳轉 | 直接 `goTo()` |

### 情境模擬開關

> 控制面板（手機外部），用 `.ctrl-toggle` + `.dot` 指示燈。

從 flowchart 的分支條件自動提取：

| 開關 | ON 效果 | OFF 效果 |
|------|---------|---------|
| 「此帳號已存在」 | 驗證後直接登入 | 進入註冊流程 |
| 「手機有舊帳號」 | 彈出帳號合併確認 | 正常繼續 |

**原則**：只提取影響 flowchart 分支的條件，不過度設計。

```javascript
function toggleSim(key) {
  S[key] = !S[key];
  document.getElementById('toggle-' + key).classList.toggle('active');
}
```

### 快捷導航

- **重置按鈕**：`resetTo(screenId)` — 清空 history/context/provider，隱藏所有 overlay
- **跳轉按鈕**：直接跳到特定 FA 入口
- **從頭開始**：從 Splash 開始

### Breadcrumb

- `updateBreadcrumb()`：顯示最後 4 個歷史節點 + 當前畫面
- 用 `→` 分隔，最後一個用 `.current`（cyan `#4fc3f7`，bold）
- 若 `S.context` 存在，末尾附加 `[login]` / `[bind]` 色彩 badge

---

## Phase 3：CSS 設計系統

### 色彩系統（同 wireframe 灰階 + 語意色）

```css
:root {
  --pri: #343a40;           --pri-text: #fff;
  --bg: #ffffff;            --bg2: #f8f9fa;
  --border: #dee2e6;        --text: #212529;
  --text2: #495057;         --text3: #adb5bd;
  --input-border: #ced4da;
  --accent: #1565c0;        --danger: #dc3545;
  --success: #28a745;
}
body { background: #1a1a2e; } /* 深色主題 — 手機外框環境 */
```

### 動畫系統（7 個 @keyframes）

| 動畫 | 用途 | 時長 |
|------|------|------|
| `slideIn` | 畫面從右滑入（前進） | 0.3s ease-out |
| `slideBack` | 畫面從左滑入（返回） | 0.3s ease-out |
| `fadeIn` | Overlay 背景淡入 | 0.2s |
| `scaleIn` | Dialog/OAuth 框放大出現 | 0.25s ease-out |
| `spin` | Spinner 旋轉 | 1s linear infinite |
| `loadBar` | OAuth 進度條 | 1.5s ease-in-out forwards |
| `toastIn` | Toast 上浮出現 | 0.3s ease-out |

### Z-Index 三層架構

| 層 | z-index | 元素 | 遮罩 |
|----|---------|------|------|
| Dialog Overlay | 10 | `.overlay` | rgba(0,0,0,.4) |
| OAuth Popup | 20 | `.oauth-popup` | rgba(0,0,0,.6) |
| Toast | 30 | `.toast` | 無 |

### 手機外框

```css
.phone-wrap {
  width: 375px;
  min-height: 812px;        /* iPhone X/11 */
  background: #000;         /* 黑色邊框 */
  border-radius: 40px;      /* 外圓角 */
  padding: 12px;            /* 邊框寬度 */
  box-shadow: 0 20px 60px rgba(0,0,0,.5);
}
.phone-inner {
  width: 100%;
  height: 788px;            /* 812 - 24px padding */
  background: var(--bg);
  border-radius: 30px;      /* 內圓角 */
  overflow: hidden;
  position: relative;       /* 畫面 absolute 定位基準 */
}
```

### 畫面切換機制

```css
.screen {
  position: absolute;
  inset: 0;                 /* 填滿 phone-inner */
  display: none;
  flex-direction: column;
  overflow-y: auto;
}
.screen.active { display: flex; }
.screen.slide-in { animation: slideIn .3s ease-out; }
.screen.slide-back { animation: slideBack .3s ease-out; }
```

```javascript
function showScreen(id, isBack) {
  S.screen = id;
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active', 'slide-in', 'slide-back');
  });
  const el = document.getElementById('s-' + id);
  el.classList.add('active');
  el.classList.add(isBack ? 'slide-back' : 'slide-in');
  updateBreadcrumb();
  // 畫面專屬 setup（如 renderProviders、setupEmailWait）
}

function goTo(id, context) {
  if (context) S.context = context;
  S.history.push(id);
  showScreen(id, false);
}

function goBack() {
  if (S.history.length > 1) {
    S.history.pop();
    const prev = S.history[S.history.length - 1];
    showScreen(prev, true);  // isBack=true → slideBack
  }
}

function resetTo(id) {
  S.history = [];
  S.context = null;
  S.provider = null;
  S.otpFilled = 0;
  hideAllOverlays();
  goTo(id);
}
```

### 控制面板（深色主題）

```css
.controls {
  max-width: 800px;
  color: #e0e0e0;
}
.ctrl-toggle {
  background: #2a2a4a;
  border: 1px solid #3a3a5a;
  border-radius: 20px;
  padding: 6px 12px;
  cursor: pointer;
}
.ctrl-toggle.active {
  background: #1565c0;
  border-color: #1976d2;
  color: white;
}
.ctrl-toggle .dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #666;
}
.ctrl-toggle.active .dot {
  background: #4fc3f7;  /* 亮藍指示燈 */
}
```

### UI 元件清單（同 wireframe 灰階）

| 元素 | CSS class | 說明 |
|------|-----------|------|
| Status Bar | `.sbar` | 50px, bg2, "9:41" |
| Nav Bar | `.nbar` | 52px, 白底, `.back` 返回鍵（hover accent） |
| Content | `.cnt` | flex:1, 20px 16px padding |
| Primary Button | `.btn.btn-p` | pri 底白字, 12px radius |
| Secondary Button | `.btn.btn-s` | 白底灰邊 |
| Danger Button | `.btn.btn-d` | danger 底白字 |
| OAuth Button | `.btn-oauth` | 白底灰邊, 14px radius, `.ico` 方塊 |
| Link Button | `.btn-link` | accent 底線，`.muted` 灰色版 |
| Input | `.input` | 白底灰邊, 10px radius, focus accent |
| OTP Cell | `.otp-cell` | 48×58px, `.filled` accent 邊, `.focus` 陰影 |
| Card | `.card` | 白底灰邊, 12px radius |
| Avatar | `.avatar` | 44px 圓形, bg2 |
| Provider Row | `.prow` | flex, `.pico` 圖標 + `.pinfo` + `.pact` |
| Chip (bind) | `.chip.chip-bind` | accent 邊/色, light blue 底 |
| Chip (unbind) | `.chip.chip-unbind` | danger 邊/色, light red 底 |
| Dialog | `.dlg` | 白底, 20px radius, max-width 320px, scaleIn |
| OAuth Box | `.oauth-box` | 白底, 16px radius, 280px, `.progress-bar` loadBar |
| Toast | `.toast` | pri 底白字, bottom 80px, toastIn |
| Spinner | `.spinner` | 44px, spin animation |
| Gap | `.gap` / `.gap-lg` | 12px / 24px 間距 |

---

## 存檔

1. 寫入 `{spec_folder}/frontend/wireframe-interactive.html`
2. `open` 在瀏覽器中開啟
3. 不更新 `sdd_context.json`（衍生產出物）

---

## 輸出格式

```
Interactive Prototype：{功能名}

互動統計
├── Screen 數量：{N} 個
├── 狀態轉移：{M} 條
├── 情境開關：{K} 個
├── 模擬互動：OAuth / OTP / Email / Modal / Toast
├── 動畫：slideIn/slideBack + fadeIn + scaleIn + loadBar
├── HTML 檔案：{路徑}
└── 瀏覽方式：已在瀏覽器開啟

快捷操作
├── 控制面板：情境開關 + 快捷跳轉
├── Breadcrumb：歷史路徑 + context 標記
└── 方向動畫：前進從右滑入 / 返回從左滑入

請在瀏覽器中點擊各按鈕走完整流程。
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
3. `cp {spec_folder}/frontend/wireframe-interactive.html {session}/wireframe-interactive.html`

**未啟動 → 完全跳過，不報錯。**

## Gate

- 完成 → 存檔，結束
- 修改 → 調整互動邏輯、新增情境開關、修改模擬行為
- 迭代 → 可多輪調整（brainstorm-server 即時預覽）

> **Pipeline 定位**：wireframe-interactive 不在自動管線中（flowchart → wireframe → S1），為手動觸發。適合在 S0 確認後、S1 開始前，讓團隊體驗完整 UX 流程。
