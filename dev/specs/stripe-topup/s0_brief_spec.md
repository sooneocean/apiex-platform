# S0 Brief Spec: Stripe 自助儲值

> **階段**: S0 需求討論
> **建立時間**: 2026-03-15 02:00
> **Agent**: requirement-analyst
> **Spec Mode**: Full Spec
> **工作類型**: new_feature

---

## 0. 工作類型

**本次工作類型**：`new_feature`（FA-B，原 apiex-platform scope_out，現正式啟動）

## 1. 一句話描述

讓 Apiex 平台用戶透過 Stripe Checkout Session 自助儲值，付款成功後系統自動增加 quota_tokens，取代 admin 手動設定配額。

## 2. 為什麼要做

### 2.1 痛點

- **無法 Scale**：admin 手動在 DB 設定 quota_tokens，每個新用戶或每次充值都要人工操作
- **用戶體驗差**：用戶有使用需求時必須等待 admin 回應，無法即時取得額度
- **無付款記錄**：沒有交易記錄追蹤，admin 無法確認哪個用戶充了多少錢

### 2.2 目標

- 建立完整的預付儲值閉環：選擇方案 → 付款 → 自動到帳 → 可查記錄
- 用戶零等待取得 quota，admin 無需人工介入
- 所有交易有據可查（Stripe + 本地 topup_logs 雙軌記錄）

## 3. 使用者

| 角色 | 說明 |
|------|------|
| 一般用戶 | 在用戶自助頁面選擇儲值方案、完成 Stripe 付款、查看充值記錄 |
| Admin | 在 Admin UI 查看所有用戶的充值記錄 |

## 4. 核心流程

### 4.0 功能區拆解

#### 功能區識別表

| FA ID | 功能區名稱 | 一句話描述 | 入口 | 獨立性 |
|-------|-----------|-----------|------|--------|
| FA-B1 | 用戶自助儲值 | 用戶選擇方案、透過 Stripe 付款、自動取得 quota | 用戶 Portal 儲值頁 | 高 |
| FA-B2 | Webhook 處理與帳務 | 接收 Stripe Webhook、冪等累加 quota、記錄 topup_logs | Stripe 回呼 | 高 |
| FA-B3 | 充值記錄檢視 | 用戶查看自己的充值記錄；Admin 查看所有充值記錄 | 用戶 Portal / Admin UI | 中 |

**本次策略**：`single_sop_fa_labeled`

#### 跨功能區依賴

| 來源 FA | 目標 FA | 依賴類型 | 說明 |
|---------|---------|---------|------|
| FA-B1 | FA-B2 | 事件觸發 | Checkout 完成後 Stripe 觸發 Webhook |
| FA-B2 | FA-B3 | 資料共用 | Webhook 寫入 topup_logs，FA-B3 讀取顯示 |

---

### 4.1 系統架構總覽

**架構重點**：

| 層級 | 組件 | 職責 |
|------|------|------|
| **前端** | 用戶 Portal 儲值頁 + 充值記錄頁 | 方案選擇、跳轉 Stripe、顯示記錄 |
| **後端** | POST /topup/checkout, POST /topup/webhook, GET /topup/history | 建立 Checkout Session、處理 Webhook、查詢記錄 |
| **第三方** | Stripe Checkout Session API + Webhook | 託管付款頁、付款完成通知 |
| **資料** | topup_logs 表 | 儲值記錄（金額、tokens、stripe_session_id、狀態） |

---

### 4.2 FA-B1: 用戶自助儲值

#### 4.2.1 全局流程圖

用戶進入儲值頁 → 選擇方案（$5/$10/$20）→ 點擊「前往付款」→ 後端建立 Stripe Checkout Session → 前端跳轉至 Stripe 託管頁面 → 用戶完成付款 → Stripe 重導至 success_url → 前端顯示「處理中」→ polling 確認 quota 已更新 → 顯示成功。

#### 4.2.2 選擇方案與建立 Session

- 固定方案：$5（500K tokens）、$10（1M tokens）、$20（2M tokens）
- 後端 POST /topup/checkout：驗證 JWT → 驗證方案合法（$5/$10/$20）→ 呼叫 Stripe API 建立 Checkout Session（metadata: user_id, plan_id, tokens）→ 回傳 session.url
- 前端收到 url 後 `window.location.href = url` 跳轉

#### 4.2.3 付款成功返回

- Stripe 付款成功後重導至 `{WEB_URL}/topup/success?session_id={CHECKOUT_SESSION_ID}`
- 成功頁顯示「付款成功，正在處理中...」
- 前端每 2 秒 polling GET /topup/status?session_id={id}，直到後端確認 Webhook 已處理
- 確認後顯示「充值完成！已增加 {N} tokens」

#### 4.2.N Happy Path 摘要

| 路徑 | 入口 | 結果 |
|------|------|------|
| **A：$5 儲值** | 儲值頁 → 選 $5 → Stripe 付款 | quota +500K tokens |
| **B：$10 儲值** | 儲值頁 → 選 $10 → Stripe 付款 | quota +1M tokens |
| **C：$20 儲值** | 儲值頁 → 選 $20 → Stripe 付款 | quota +2M tokens |

---

### 4.3 FA-B2: Webhook 處理與帳務

#### 4.3.1 全局流程圖

Stripe POST /topup/webhook → 驗證簽名（stripe-signature header + webhook secret）→ 解析 event type → 只處理 `checkout.session.completed` → 從 metadata 取 user_id + tokens → 檢查冪等（stripe_event_id 是否已處理）→ 累加 quota_tokens → 寫入 topup_logs → 回傳 200。

#### 4.3.2 冪等機制

- topup_logs 表有 `stripe_event_id` UNIQUE 約束
- INSERT 時若 duplicate → 跳過，回傳 200（Stripe 視為成功，不重試）
- 避免重複累加 quota

#### 4.3.N Happy Path 摘要

| 路徑 | 入口 | 結果 |
|------|------|------|
| **A：首次 Webhook** | Stripe 送 checkout.session.completed | quota 累加 + topup_logs 寫入 |
| **B：重複 Webhook** | 同一 event_id 再次送達 | 跳過，回傳 200 |

---

### 4.4 FA-B3: 充值記錄檢視

#### 4.4.1 全局流程圖

用戶進入充值記錄頁 → GET /topup/history → 顯示列表（日期、金額、tokens、狀態）。
Admin 進入 Admin UI 充值記錄 → GET /admin/topup-logs → 顯示所有用戶的充值記錄（含篩選）。

#### 4.4.N Happy Path 摘要

| 路徑 | 入口 | 結果 |
|------|------|------|
| **A：用戶查看記錄** | 用戶 Portal → 充值記錄 | 顯示自己的充值歷史 |
| **B：Admin 查看記錄** | Admin UI → 充值記錄 | 顯示所有用戶充值歷史 + 篩選 |

---

### 4.5 例外流程圖

- 付款失敗 → Stripe 原生錯誤頁 → 用戶返回儲值頁重試
- Webhook 簽名驗證失敗 → 回傳 400，不處理
- Webhook 延遲 → 成功頁 polling 超時（30s）→ 顯示「處理中，請稍後刷新查看」
- 金額不合法 → POST /topup/checkout 回傳 400

### 4.6 六維度例外清單

| 維度 | ID | FA | 情境 | 觸發條件 | 預期行為 | 嚴重度 |
|------|-----|-----|------|---------|---------|--------|
| 並行/競爭 | E1 | FA-B1 | 連按兩次「付款」建立兩筆 Session | 用戶快速點擊 | 兩筆 Session 獨立，各自冪等處理 | P2 |
| 狀態轉換 | E2 | FA-B2 | Session 過期後付款 | 超過 24hr | Stripe 拒絕付款，不產生 Webhook | P2 |
| 資料邊界 | E3 | 全域 | quota_tokens 累加後超大值 | 大量儲值 | BIGINT 無溢出風險 | P2 |
| 網路/外部 | E4 | FA-B2 | Webhook 延遲或服務重啟 | Stripe 重試 | stripe_event_id 冪等去重 | P0 |
| 業務邏輯 | E5 | FA-B2 | 退款後 quota 回收 | Stripe 退款 | MVP 不處理退款，scope out | P2 |
| UI/體驗 | E6 | FA-B1 | 付款成功但 Webhook 未到 | 非同步延遲 | 成功頁 polling + 超時提示 | P1 |

### 4.7 白話文摘要

這次改造讓用戶可以自己在平台上用信用卡儲值，不需要再等管理員手動操作。用戶選好金額後會跳到 Stripe 的安全付款頁面，付完後回到平台就能看到額度已經增加。如果付款後系統還在處理中，頁面會自動等待並提示。最壞情況是 Stripe 通知延遲，用戶可能需要等幾秒鐘刷新才看到額度更新。

## 5. 成功標準

| # | FA | 類別 | 標準 | 驗證方式 |
|---|-----|------|------|---------|
| 1 | FA-B1 | 功能 | 用戶選擇 $5/$10/$20 方案後成功跳轉至 Stripe Checkout | E2E 測試 |
| 2 | FA-B1 | 功能 | Stripe 付款成功後用戶被重導至成功頁 | E2E 測試 |
| 3 | FA-B2 | 功能 | Webhook 收到 checkout.session.completed 後 quota_tokens 正確累加 | 單元測試 |
| 4 | FA-B2 | 安全 | Webhook 簽名驗證失敗時回傳 400 不處理 | 單元測試 |
| 5 | FA-B2 | 穩健 | 同一 stripe_event_id 重複送達不會雙倍累加 quota | 單元測試 |
| 6 | FA-B3 | 功能 | 用戶可查看自己的充值記錄 | API 測試 |
| 7 | FA-B3 | 功能 | Admin 可查看所有用戶充值記錄 | API 測試 |
| 8 | FA-B1 | 體驗 | 成功頁 polling 確認 quota 更新後顯示成功訊息 | 手動測試 |

## 6. 範圍

### 範圍內
- **FA-B1**: 儲值方案選擇 UI（固定 $5/$10/$20）
- **FA-B1**: Stripe Checkout Session 建立 API
- **FA-B1**: 成功/取消返回頁面 + polling 機制
- **FA-B2**: Stripe Webhook endpoint（簽名驗證 + 冪等處理）
- **FA-B2**: quota_tokens 自動累加
- **FA-B2**: topup_logs 記錄寫入
- **FA-B3**: 用戶充值記錄 API + 頁面
- **FA-B3**: Admin 充值記錄 API + 頁面

### 範圍外
- 自動計費扣款（後付制）
- 退款流程（退款後 quota 回收）
- 訂閱制方案
- 多幣種支援（僅 USD）
- 自由輸入金額
- 客製化發票
- per-key 儲值（以 user 為單位）
- Stripe Payment Intents / Elements 內嵌表單

## 7. 已知限制與約束

- 使用 Stripe Checkout Session（跳轉模式），不做內嵌表單
- 幣種固定 USD
- 換算比率：$1 = 100,000 quota_tokens
- 最低 $5，最高 $100（固定方案 $5/$10/$20）
- Stripe Test Mode 驗收即可
- 充值直接累加現有 quota_tokens，不拆分 admin_granted / user_purchased
- Webhook secret 需設定為環境變數 STRIPE_WEBHOOK_SECRET
- 需安裝 stripe npm package

## 8. 前端 UI 畫面清單

### 8.1 FA-B1: 用戶自助儲值 畫面

| # | 畫面 | 狀態 | 既有檔案 | 變更說明 |
|---|------|------|---------|---------|
| 1 | **儲值頁** | 新增 | — | 顯示三個方案卡片 + 「前往付款」按鈕 |
| 2 | **付款成功頁** | 新增 | — | 顯示處理中 → 成功訊息 |
| 3 | **付款取消頁** | 新增 | — | 顯示「付款已取消」+ 返回儲值頁連結 |

### 8.2 FA-B3: 充值記錄 畫面

| # | 畫面 | 狀態 | 既有檔案 | 變更說明 |
|---|------|------|---------|---------|
| 4 | **用戶充值記錄頁** | 新增 | — | 列表顯示充值歷史 |
| 5 | **Admin 充值記錄頁** | 新增 | — | Admin UI 新增 tab，顯示所有充值記錄 |

### 8.3 Alert / 彈窗清單

| # | Alert | FA | 狀態 | 觸發場景 | 內容摘要 |
|---|-------|-----|------|---------|---------|
| A1 | **Polling 超時提示** | FA-B1 | 新增 | 成功頁 polling 30s 未收到確認 | 「處理中，請稍後刷新查看」 |

### 8.4 畫面統計摘要

| 類別 | 數量 | 說明 |
|------|------|------|
| 新增畫面 | **5** | 儲值頁、成功頁、取消頁、用戶記錄頁、Admin 記錄頁 |
| 既有修改畫面 | **1** | Admin layout 新增「充值記錄」導航 |
| 新增 Alert | **1** | Polling 超時提示 |

---

## 9. 補充說明

### 用戶 Portal 架構

目前 web-admin 僅有 admin 頁面（`/admin/*`）。本次需新增用戶自助區域（`/portal/*`），使用相同的 Supabase Auth 但不需 admin email 白名單檢查。

### Stripe API 版本

使用 stripe npm package 最新穩定版，API version 不鎖定。

### topup_logs 資料表結構（參考）

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID | PK |
| user_id | UUID | FK → auth.users |
| stripe_session_id | TEXT | Checkout Session ID |
| stripe_event_id | TEXT | Webhook Event ID（UNIQUE，冪等鍵） |
| amount_usd | INTEGER | 金額（美分，如 500 = $5） |
| tokens_granted | BIGINT | 授予的 tokens 數量 |
| status | TEXT | pending / completed / failed |
| created_at | TIMESTAMPTZ | 建立時間 |
| completed_at | TIMESTAMPTZ | 完成時間 |
