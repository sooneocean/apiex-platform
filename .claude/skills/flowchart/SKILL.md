---
name: flowchart
description: "流程圖 HTML 渲染。從 S0 Brief Spec §4 提取 Mermaid 流程圖或用戶描述，產出可直接瀏覽的 HTML（Mermaid.js CDN）。觸發：flowchart、流程圖、畫流程圖、flow。"
---

# Flowchart — Mermaid 流程圖 HTML 渲染

> 從 S0 Brief Spec §4 的 Mermaid 區塊或用戶描述，產出單一 HTML 檔案。
> 瀏覽器直開即可檢視，零依賴（Mermaid.js CDN）。
> 兩種模式：Pipeline（讀 S0 brief spec）或 Standalone（用戶口述）。

## Phase 0：既有檔案偵測（MUST — 不可跳過）

> S0→S1 前端偵測管線或用戶手動觸發前，先檢查目標位置是否已有 flowchart。

1. 判斷 spec folder：有進行中 SOP → `dev/specs/{feature}/`，否則待定
2. 檢查 `{spec_folder}/frontend/flowchart.html` 是否存在
3. **已存在**：
   - 告知用戶：「偵測到既有 flowchart.html，跳過生成。」
   - 更新 `sdd_context.json`：`stages.s0.output.frontend_design.flowchart_path`（若尚未設定）
   - **Pipeline 模式**：直接接續 wireframe skill，不重新生成
   - **Standalone 模式**：詢問「要覆蓋還是跳過？」
4. **不存在** → 繼續「模式偵測」正常流程

---

## 模式偵測

1. 檢查 `dev/specs/` 下是否有進行中的 SOP（`sdd_context.json` 存在且 `status == "in_progress"`）
2. **Pipeline 模式**：有 SOP 且 S0 已完成 → 讀取 `s0_brief_spec.md`
3. **Standalone 模式**：無 SOP 或用戶直接觸發 → 用 AskUserQuestion 詢問

## Pipeline 模式工作流

1. 讀取 `dev/specs/{feature}/s0_brief_spec.md`
2. 提取 §4 核心流程中所有 ` ```mermaid ``` ` 區塊，記錄每個區塊的：
   - 章節編號（§4.x.y）
   - 標題
   - 完整 Mermaid 語法
3. 列出辨識結果，用 AskUserQuestion 確認：
   「我辨識到以下流程圖，有漏的嗎？」
   - §4.1 系統架構總覽
   - §4.2.1 FA-A 全局流程圖
   - §4.2.2 FA-A 子流程 ...
4. 用戶確認後，生成 HTML
5. 存檔：`dev/specs/{feature}/frontend/flowchart.html`

## Standalone 模式工作流

1. AskUserQuestion：「要畫什麼流程圖？請描述流程步驟和分支。」
2. 根據描述建立 Mermaid 語法
3. 生成 HTML
4. 存檔位置：
   - 有 SOP 進行中 → `dev/specs/{feature}/frontend/flowchart.html`
   - 無 SOP → 建立 `dev/specs/{descriptive-name}/frontend/flowchart.html`

---

## HTML 模板

生成的 HTML 使用以下結構：

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{功能名稱} — Flowchart</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <style>
    :root {
      --color-bg: #ffffff;
      --color-text: #1e293b;
      --color-border: #e2e8f0;
      --color-section-bg: #f8fafc;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      padding: 40px;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .meta { color: #64748b; font-size: 14px; margin-bottom: 32px; }
    .chart-section {
      background: var(--color-section-bg);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .chart-section h2 {
      font-size: 18px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--color-border);
    }
    .mermaid { text-align: center; }
    @media print {
      .chart-section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>{功能名稱} — 流程圖</h1>
  <p class="meta">Generated from S0 Brief Spec §4 | {YYYY-MM-DD}</p>

  <!-- 每個 Mermaid 區塊一個 section -->
  <div class="chart-section">
    <h2>§4.x.y {章節標題}</h2>
    <div class="mermaid">
      {Mermaid 語法原文，保留 classDef}
    </div>
  </div>

  <!-- 重複上方 section... -->

  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'base',
      themeVariables: {
        primaryColor: '#e3f2fd',
        primaryTextColor: '#1565c0',
        primaryBorderColor: '#1565c0',
        lineColor: '#94a3b8',
        secondaryColor: '#e8f5e9',
        tertiaryColor: '#fff3e0'
      }
    });
  </script>
</body>
</html>
```

> **關鍵**：Mermaid 語法直接從 S0 brief spec 複製貼上，不做任何修改。
> classDef 定義（`:::fe`、`:::be` 等）由 brief spec 自帶，Mermaid.js 會自動渲染。

## 色彩

HTML 不自行定義節點色彩——色彩由 Mermaid 語法中的 `classDef` 控制，與 S0 brief spec §4 完全一致：

| Class | 角色 | 色碼（brief spec 定義） |
|-------|------|----------------------|
| `:::fe` | 前端 | `#e3f2fd` bg, `#1565c0` text/stroke |
| `:::be` | 後端 | `#e8f5e9` bg, `#2e7d32` text/stroke |
| `:::tp` | 第三方 | `#fff3e0` bg, `#e65100` text/stroke |
| `:::ex` | 例外 | `#ffebee` bg, `#c62828` text/stroke |
| `:::db` | 資料 | `#f3e5f5` bg, `#6a1b9a` text/stroke |

## Screen ID 標記

> 此步驟為 wireframe skill 做準備。

生成 flowchart 時，同步建立 Screen ID 映射表：
1. 掃描所有 Mermaid 區塊中的 `:::fe` 節點
2. 為每個 `:::fe` 節點分配 Screen ID（S1, S2, S3...）
3. 映射表記錄在 HTML 的隱藏 `<script type="application/json">` 區塊：

```html
<script type="application/json" id="screen-id-map">
{
  "screens": [
    { "id": "S1", "mermaid_node": "LoginPage", "label": "登入頁面" },
    { "id": "S2", "mermaid_node": "ListPage", "label": "列表頁" }
  ]
}
</script>
```

> wireframe skill 讀取此 JSON 來建立畫面與流程圖的對應。

---

## 存檔與回寫

### Pipeline 模式

1. 確保目錄存在：`mkdir -p dev/specs/{feature}/frontend/`
2. 寫入 `dev/specs/{feature}/frontend/flowchart.html`
3. 更新 `sdd_context.json`：
   - `stages.s0.output.frontend_design.flowchart_path` = `dev/specs/{feature}/frontend/flowchart.html`
4. 通知：「flowchart 完成，接續 wireframe。」

### Standalone 模式

1. 建立目錄：`mkdir -p dev/specs/{descriptive-name}/frontend/`
2. 寫入 `dev/specs/{descriptive-name}/frontend/flowchart.html`
3. 通知存檔路徑

---

## 輸出格式

```
Flowchart：{功能名}

流程圖清單：
{N} 個 Mermaid 圖表

設計資訊
├── 圖表數量：{N} 個
├── Screen ID：{M} 個（S1~S{M}）
├── HTML 檔案：{路徑}
└── 瀏覽方式：open {路徑}

[用瀏覽器開啟確認]
```

---

## 安全規則

- 不修改任何專案程式碼
- 不修改 S0 brief spec 原始 Mermaid 語法
- Pipeline 模式下讀取 brief spec 為純讀取

## Live Preview（可選）

若 superpowers brainstorm-server 已啟動，自動觸發瀏覽器 live-reload：

1. 尋找最新 session：`ls -td .superpowers/brainstorm/*/` 取第一個
2. 讀取 `{session}/.server.pid`，確認 process 活著（`kill -0 $pid`）
3. `cp dev/specs/{feature}/frontend/flowchart.html {session}/flowchart.html`
4. chokidar 偵測到新檔 → WebSocket 通知瀏覽器 reload
5. 告知用戶：「瀏覽器已自動刷新」

**未啟動 → 完全跳過，不報錯。** canonical artifact 永遠在 `dev/specs/{feature}/frontend/`。

## Gate

- 完成 → Pipeline 模式自動接續 wireframe skill
- 修改 → 調整 Mermaid 語法或重新生成
