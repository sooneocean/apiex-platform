---
name: wireframe
description: "Wireframe 線框圖 HTML 渲染。從 S0 Brief Spec §8 畫面清單 + flowchart.html，產出 Lo-fi 灰階線框 HTML。觸發：wireframe、線框圖、畫 wireframe、UI 草圖、畫面規劃。"
---

# Wireframe — Lo-fi 線框圖 HTML 渲染

> 從 S0 Brief Spec §8 UI 畫面清單 + flowchart.html 的 Screen ID 映射，產出單一 HTML 檔案。
> 灰階 Lo-fi 風格，專注佈局與資訊架構，不處理視覺設計。
> 瀏覽器直開即可檢視，零依賴（純 HTML + inline CSS）。
> 兩種模式：Pipeline（讀 S0 brief spec + flowchart.html）或 Standalone（用戶口述）。

## Phase 0：既有檔案偵測（MUST — 不可跳過）

> S0→S1 前端偵測管線或用戶手動觸發前，先檢查目標位置是否已有 wireframe。

1. 判斷 spec folder：有進行中 SOP → `dev/specs/{feature}/`，否則待定
2. 檢查 `{spec_folder}/frontend/wireframe.html` 是否存在
3. **已存在**：
   - 告知用戶：「偵測到既有 wireframe.html，跳過生成。」
   - 更新 `sdd_context.json`：`stages.s0.output.frontend_design.wireframe_path`（若尚未設定）
   - **Pipeline 模式**：直接結束，回到 Conductor 進 S1
   - **Standalone 模式**：詢問「要覆蓋還是跳過？」
4. **不存在** → 繼續「模式偵測」正常流程

---

## 模式偵測

1. 檢查 `dev/specs/` 下是否有進行中的 SOP（`sdd_context.json` 存在且 `status == "in_progress"`）
2. **Pipeline 模式**：有 SOP 且 S0 已完成 → 讀取 `s0_brief_spec.md` + `frontend/flowchart.html`
3. **Standalone 模式**：無 SOP 或用戶直接觸發 → 用 AskUserQuestion 詢問

## Pipeline 模式工作流

1. 讀取 `dev/specs/{feature}/s0_brief_spec.md` §8（UI 畫面清單）
2. 讀取 `dev/specs/{feature}/frontend/flowchart.html` 中的 Screen ID 映射（`<script id="screen-id-map">`）
   - 若 flowchart.html 不存在，自行從 S0 §4 的 `:::fe` 節點建立映射
3. 提取每個畫面的：
   - Screen ID（S1, S2...，與 flowchart 對應）
   - 畫面名稱
   - 狀態（新增/既有修改/不動）
   - FA 歸屬
   - 主要元素與互動
4. 列出辨識結果，用 AskUserQuestion 確認：
   「我辨識到以下 {N} 個畫面，有漏的嗎？」
5. 用戶確認後，生成 HTML
6. 存檔：`dev/specs/{feature}/frontend/wireframe.html`

## Standalone 模式工作流

1. AskUserQuestion：「要畫什麼畫面的 wireframe？請描述畫面和主要元素。」
2. 提取畫面清單
3. 若 `flowchart.html` 存在 → 讀取 Screen ID 映射
4. 生成 HTML
5. 存檔位置：
   - 有 SOP 進行中 → `dev/specs/{feature}/frontend/wireframe.html`
   - 無 SOP → `dev/specs/{descriptive-name}/frontend/wireframe.html`

---

## HTML 模板

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{功能名稱} — Wireframe</title>
  <style>
    :root {
      /* 動態色彩 — 未來可由 theme config 覆蓋 */
      --color-primary: #343a40;
      --color-primary-text: #ffffff;
      --color-secondary-border: #adb5bd;
      --color-bg: #ffffff;
      --color-text-heading: #212529;
      --color-text-body: #343a40;
      --color-text-hint: #adb5bd;
      --color-screen-bg: #f8f9fa;
      --color-screen-border: #dee2e6;
      --color-input-border: #ced4da;
      --color-divider: #dee2e6;
      --color-icon-bg: #e9ecef;
      --color-error: #dc3545;
      --color-status-bar: #e9ecef;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--color-bg);
      color: var(--color-text-body);
      padding: 40px;
    }

    h1 { font-size: 24px; margin-bottom: 8px; color: var(--color-text-heading); }
    .meta { color: #64748b; font-size: 14px; margin-bottom: 32px; }

    .screens-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 40px;
      justify-content: flex-start;
    }

    .screen {
      width: 375px;
      min-height: 667px;
      background: var(--color-screen-bg);
      border: 1px solid var(--color-screen-border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Status Bar */
    .status-bar {
      height: 44px;
      background: var(--color-status-bar);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-hint);
      font-size: 12px;
    }

    /* Navigation Bar */
    .nav-bar {
      height: 56px;
      background: var(--color-bg);
      display: flex;
      align-items: center;
      padding: 0 16px;
      font-size: 18px;
      font-weight: 600;
      color: var(--color-text-heading);
    }
    .nav-bar .back { margin-right: 12px; color: var(--color-text-hint); }

    /* Content */
    .content {
      flex: 1;
      background: var(--color-bg);
      padding: 16px;
    }

    /* Bottom Tab Bar */
    .tab-bar {
      height: 56px;
      background: var(--color-bg);
      border-top: 1px solid var(--color-screen-border);
      display: flex;
      align-items: center;
      justify-content: space-around;
      color: var(--color-text-hint);
      font-size: 11px;
    }

    /* UI Elements */
    .btn-primary {
      background: var(--color-primary);
      color: var(--color-primary-text);
      border: none;
      border-radius: 8px;
      padding: 12px 24px;
      font-size: 14px;
      width: 100%;
      cursor: pointer;
    }
    .btn-secondary {
      background: var(--color-bg);
      color: var(--color-text-body);
      border: 1px solid var(--color-secondary-border);
      border-radius: 8px;
      padding: 12px 24px;
      font-size: 14px;
      width: 100%;
    }
    .input-field {
      background: var(--color-bg);
      border: 1px solid var(--color-input-border);
      border-radius: 6px;
      padding: 12px;
      font-size: 14px;
      width: 100%;
      color: var(--color-text-hint);
    }
    .card {
      background: var(--color-bg);
      border: 1px solid var(--color-screen-border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .list-item {
      padding: 12px 0;
      border-bottom: 1px solid var(--color-divider);
      font-size: 14px;
    }
    .divider {
      height: 1px;
      background: var(--color-divider);
      margin: 8px 0;
    }
    .img-placeholder {
      background: var(--color-icon-bg);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-hint);
      font-size: 12px;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--color-icon-bg);
      border: 1px solid var(--color-screen-border);
    }
    .tag {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      background: var(--color-screen-bg);
      border: 1px solid var(--color-screen-border);
      color: #6c757d;
    }
    .tag.selected {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-primary-text);
    }
    .error-text { color: var(--color-error); font-size: 12px; }
    .heading { font-size: 18px; font-weight: 600; color: var(--color-text-heading); }
    .caption { font-size: 12px; color: var(--color-text-hint); }

    /* Screen Label */
    .screen-label {
      background: var(--color-text-heading);
      color: white;
      padding: 4px 12px;
      font-size: 13px;
      font-weight: 600;
    }

    /* Interaction Annotations */
    .annotation {
      background: #fff3cd;
      border: 1px dashed #ffc107;
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 11px;
      color: #856404;
      margin-top: 8px;
    }

    /* Screen ID → Flow mapping */
    .flow-ref {
      font-size: 11px;
      color: #1565c0;
      margin-top: 4px;
    }

    @media print {
      .screen { break-inside: avoid; page-break-inside: avoid; }
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <h1>{功能名稱} — Wireframe</h1>
  <p class="meta">Lo-fi wireframe | {N} screens | {YYYY-MM-DD}</p>

  <div class="screens-grid">

    <!-- 每個 Screen 一個區塊 -->
    <div class="screen">
      <div class="screen-label">S{N}: {畫面名稱}</div>
      <div class="status-bar">9:41</div>
      <div class="nav-bar">
        <span class="back">←</span>
        {頁面標題}
      </div>
      <div class="content">
        <!-- UI 元素依畫面需求組合 -->
        <div class="input-field">Email</div>
        <div style="height: 12px;"></div>
        <div class="input-field">Password</div>
        <div style="height: 16px;"></div>
        <button class="btn-primary">登入</button>
        <div class="annotation">→ 點擊後：API 驗證 → 成功導向 S2</div>
        <div class="flow-ref">Flow: §4.2.1 LoginFlow → AuthAPI</div>
      </div>
      <div class="tab-bar">
        <span>首頁</span>
        <span>搜尋</span>
        <span>設定</span>
      </div>
    </div>

    <!-- 更多 Screen... -->

  </div>
</body>
</html>
```

### 關鍵原則

1. **CSS 變數**：所有色彩用 `var(--color-*)` 定義在 `:root`，不寫死
2. **Lo-fi 灰階**：預設灰階配色（#f8f9fa, #343a40, #dee2e6），專注佈局
3. **互動標註**：每個互動元素下方加 `.annotation` 說明點擊後行為
4. **Flow 參照**：用 `.flow-ref` 標記此元素對應 flowchart 的哪個節點/路徑
5. **Screen ID**：每個 Screen 頂部 `.screen-label` 帶 ID（S1, S2...），與 flowchart 對應
6. **375×667**：iPhone 8 比例，標準 wireframe 尺寸

### Screen 元素清單（Lo-fi 灰階）

| 元素 | CSS class | 說明 |
|------|-----------|------|
| Screen 容器 | `.screen` | 375×667，淺灰底 + 灰邊框 |
| Status Bar | `.status-bar` | 固定 44px，灰底 |
| Navigation Bar | `.nav-bar` | 56px，白底，含返回 + 標題 |
| Bottom Tab Bar | `.tab-bar` | 56px，白底，灰上邊框 |
| Content Area | `.content` | flex:1，白底，16px padding |
| Button (Primary) | `.btn-primary` | 深灰底白字，8px 圓角 |
| Button (Secondary) | `.btn-secondary` | 白底灰邊，8px 圓角 |
| Input Field | `.input-field` | 白底灰邊，6px 圓角 |
| Card | `.card` | 白底灰邊，12px 圓角 |
| List Item | `.list-item` | 白底，底部分隔線 |
| Divider | `.divider` | 1px 灰色分隔線 |
| Image Placeholder | `.img-placeholder` | 淺灰底，居中文字 |
| Avatar | `.avatar` | 40px 圓形，淺灰底 |
| Tag (未選) | `.tag` | 淺灰底灰邊 |
| Tag (已選) | `.tag.selected` | 深灰底白字 |
| Heading | `.heading` | 18px bold |
| Caption | `.caption` | 12px 灰色 |
| Error Text | `.error-text` | 紅色 12px |
| Annotation | `.annotation` | 黃底虛線框，互動說明 |
| Flow Ref | `.flow-ref` | 藍色 11px，流程參照 |

---

## 存檔與回寫

### Pipeline 模式

1. 寫入 `dev/specs/{feature}/frontend/wireframe.html`
2. 更新 `sdd_context.json`：
   - `stages.s0.output.frontend_design.wireframe_path` = `dev/specs/{feature}/frontend/wireframe.html`
3. 通知：「wireframe 完成，Conductor 將繼續進入 S1。」

### Standalone 模式

1. 寫入 `dev/specs/{descriptive-name}/frontend/wireframe.html`
2. 通知存檔路徑

---

## 輸出格式

```
Wireframe：{功能名}

畫面清單：
{N} 個 Screen

設計資訊
├── Screen 數量：{N} 個（S1~S{N}）
├── HTML 檔案：{路徑}
└── 瀏覽方式：open {路徑}

[用瀏覽器開啟確認]
```

---

## 安全規則

- 不修改任何專案程式碼
- Pipeline 模式下讀取 brief spec 為純讀取
- 不修改 flowchart.html

## Live Preview（可選）

若 superpowers brainstorm-server 已啟動，自動觸發瀏覽器 live-reload：

1. 尋找最新 session：`ls -td .superpowers/brainstorm/*/` 取第一個
2. 讀取 `{session}/.server.pid`，確認 process 活著（`kill -0 $pid`）
3. `cp dev/specs/{feature}/frontend/wireframe.html {session}/wireframe.html`
4. chokidar 偵測到新檔 → WebSocket 通知瀏覽器 reload
5. 告知用戶：「瀏覽器已自動刷新」

**未啟動 → 完全跳過，不報錯。** canonical artifact 永遠在 `dev/specs/{feature}/frontend/`。

## Gate

- 完成 → Pipeline 模式自動回到 Conductor 進 S1
- 修改 → 調整畫面元素或佈局

> **本 Skill 獨立於 `/design`**。Wireframe 是 Lo-fi 灰階 HTML 草圖，用於 S0→S1 階段的快速溝通；`/design` 是 Hi-fi 設計原型（Pencil），用於正式視覺設計。
