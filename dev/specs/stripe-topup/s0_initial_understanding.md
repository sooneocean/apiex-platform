# S0 初步理解：Stripe 金流自助儲值（FA-B）

> **建立時間**: 2026-03-15
> **Agent**: requirement-analyst
> **狀態**: 等待用戶確認
> **work_type**: `new_feature`
> **Spec Mode**: Full Spec（涉及金流 + DB schema 變更 + 新 API endpoints + 前端頁面）

---

## 1. 需求脈絡

### 1.1 這是什麼

Apiex Platform MVP（apiex-platform SOP，已 S7 完成）明確將 FA-B 列為 scope_out：

> **FA-B：點數儲值與計費系統** — 金流充值、per-request 自動扣款、帳單記錄

現在要將其納入開發。這不是全新產品，而是在**已上線的現有系統上**擴展金流能力。

### 1.2 現有系統相關架構（對本需求有影響的部分）

| 元件 | 現況 | 本次影響 |
|------|------|---------|
| `user_quotas` 表 | 儲存每個 user 的 `quota_remaining`（token 數） | 儲值後需要增加此欄位的值 |
| `reserve_quota` / `settle_quota` SQL functions | 樂觀預扣機制，以 token 為單位 | 若改為金錢計費需調整；若維持 token 充值不需改 |
| `packages/api-server` (Hono) | 已有 `/auth/`, `/keys/`, `/v1/`, `/admin/` routes | 需新增 `/billing/` 和 `/stripe/` routes |
| `packages/web-admin` (Next.js) | 登入頁 + 配額管理 + Usage Logs 共 3 頁 | 需新增儲值頁 |
| Fly.io 部署 | API Server | Stripe Webhook endpoint 需可公開存取（已滿足） |

### 1.3 FA-B 原始定義

原 spec 將 FA-B 拆成兩件事：
1. **金流充值（自助儲值）**：用戶自行用信用卡/銀行卡充值
2. **自動計費扣款系統**：per-request 自動扣款

這兩件事**耦合度中等但可拆解**，充值是前置，扣款是消耗。目前 MVP 已有 token-based 的「預扣 + 結算」機制，問題在於「token 從哪裡來」——現在是管理員手動設定，FA-B 要讓用戶自己買。

---

## 2. 核心需求理解

### 2.1 用戶的核心訴求（推斷）

管理員現在需要**手動在 DB 設定每個用戶的 quota_tokens**，這個方式：
- 無法 scale（每個新用戶都要人工介入）
- 無法讓用戶自助管理（用完了要找管理員）
- 無法自動化（沒有付款記錄 = 難以追蹤誰付了多少錢）

FA-B 的目標是：**用戶自己付錢，系統自動給額度，管理員從人工操作中解放出來。**

### 2.2 功能邊界的關鍵不確定點

FA-B 原始定義中的「自動計費扣款系統」存在兩種完全不同的詮釋，這是本次 S0 最需要釐清的核心問題：

**詮釋 A：Token 充值制（購買 token 包）**
```
用戶付 $10 → 獲得 100K tokens → 加到 quota_remaining
每次 API 請求 → 扣 token（現有機制，不需改）
Token 用完 → 需要再次付款充值
```

**詮釋 B：信用餘額制（預付金額，按量扣費）**
```
用戶儲值 $10 → 存為 $10 credit balance
每次 API 請求 → 依實際 token 用量 × 費率 → 扣 credit balance
Credit 用完 → 回傳 402，需要再次充值
```

兩者差異：

| 維度 | Token 充值制（A） | 信用餘額制（B） |
|------|-----------------|----------------|
| 現有系統改動 | 最小（quota_tokens 直接加） | 中等（需新增 credit_balance 欄位 + pricing 表） |
| 用戶理解難度 | 較直觀（套餐制） | 精確但需理解費率換算 |
| 定價彈性 | 低（套餐固定） | 高（可動態調整費率） |
| 開發複雜度 | M | L |
| 未來擴展性 | 低（換模型要重新定套餐） | 高（費率表可獨立更新） |

---

## 3. 功能區拆解（FA Decomposition）

本次工作對應到原 FA-B，但實際上包含多個子流程，建議識別為：

| FA ID | 功能區名稱 | 一句話描述 | 入口 | 獨立性 |
|-------|-----------|-----------|------|--------|
| FA-B1 | 自助儲值（Checkout）| 用戶透過 Stripe Checkout 完成付款，系統更新額度 | Web Admin 儲值頁 | 高 |
| FA-B2 | Stripe Webhook 處理 | 接收 Stripe 支付事件，冪等地更新資料庫 | Stripe → `/stripe/webhook` | 高（純後端） |
| FA-B3 | 儲值記錄查詢 | 用戶查看歷史充值記錄；Admin 查看全平台充值記錄 | Web Admin | 中 |
| FA-B4 | 自動計費扣款（選填）| 若選信用餘額制，每次請求依費率扣 credit | Proxy Route（現有） | 低（與 FA-C 深度耦合） |

**本次 SOP 建議範圍**：FA-B1 + FA-B2 必做；FA-B3 建議同做；FA-B4 視方案選擇決定。

---

## 4. 方案比較

### 方案 A：Token 充值套餐制（最小改動，推薦 MVP）

**流程**：
```
用戶選擇套餐（如 100K tokens = $5 / 500K tokens = $20）
→ 後端建立 Stripe Checkout Session
→ 前端重導向至 Stripe Hosted Checkout Page
→ 用戶完成付款
→ Stripe 發送 checkout.session.completed Webhook
→ 後端驗證 Stripe-Signature，冪等地更新 user_quotas.quota_remaining
→ 用戶收到「儲值成功」通知
```

**資料庫變更**：
- 新增 `payment_history` 表（記錄充值記錄）
- 不需改 `user_quotas` 結構（只需 `quota_remaining += purchased_tokens`）
- 不需改 `reserve_quota` / `settle_quota` functions

**新增元件**：
- `POST /billing/checkout` — 建立 Checkout Session
- `GET /billing/history` — 查詢充值記錄
- `POST /stripe/webhook` — 接收 Stripe 事件
- Web Admin 儲值頁（套餐選擇 + 充值記錄）

**優點**：改動範圍最小，不動現有 proxy/quota 邏輯，上線風險低
**缺點**：定價彈性低（改模型要重設套餐），用戶可能遇到 token 用到一半的情況

---

### 方案 B：信用餘額制（彈性計費，複雜度較高）

**流程**：
```
用戶任意儲值金額（如 $10）
→ Stripe Checkout → Webhook → credit_balance += $10
每次 API 請求完成
→ settle_quota 同時扣 token 與 credit（token × 費率）
→ credit_balance 耗盡 → 回傳 402
```

**資料庫變更**：
- `user_quotas` 新增 `credit_balance_cents` 欄位
- 新增 `pricing_config` 表（model_tag → price_per_1k_tokens）
- 新增 `payment_history` 表
- 改寫 `reserve_quota` / `settle_quota` functions（加入 credit 扣款邏輯）

**優點**：精確計費、定價彈性高、符合業界常見做法
**缺點**：改動範圍大（觸及核心 quota 機制）、需要維護費率表、對用戶透明度要求更高

---

### 方案 C：僅做充值，暫緩扣款邏輯

**說明**：只做 Stripe Checkout + Webhook + 充值記錄（FA-B1 + FA-B2 + FA-B3），計費扣款維持現有 token 手動設定機制，用戶充值後管理員仍需手動換算 token。

這個方案**不建議**：這樣充值和額度是脫鉤的，需要管理員二次介入，等於沒有真正解決問題。

---

## 5. 六維度例外探測（初步清單，待用戶確認）

以下是初步識別的例外情境，需要逐維度確認。

### 維度 1：並行/競爭

| 情境 | 問題 |
|------|------|
| Webhook 重複送達 | Stripe 的可靠交付機制可能在我們回傳非 2xx 時重試，同一 `checkout.session.completed` 事件可能到達多次 → 需要冪等鍵（`stripe_session_id` 唯一約束）|
| 用戶快速多次點擊「確認儲值」 | 可能建立多個 Checkout Session，但通常無害（每個 session 獨立）|

**關鍵問題**：Webhook 冪等性如何實作？用 `stripe_session_id` 作 DB unique constraint 還是另有方案？

### 維度 2：狀態轉換

| 情境 | 問題 |
|------|------|
| 支付成功但 Webhook 延遲 | 用戶在 Stripe 付款成功後被重導向回 success_url，但 Webhook 還未到達 → 用戶看到「待確認」狀態，多久會更新？|
| Checkout Session 過期 | Stripe Checkout Session 預設 24 小時過期，用戶未付款 → 過期後需要重新建立 |
| 支付進行中用戶帳號被停用 | 付款後但 Webhook 到達前帳號被管理員停用 → 如何處理？|

**關鍵問題**：success_url 返回後要不要輪詢確認支付狀態？還是完全依賴 Webhook？

### 維度 3：資料邊界

| 情境 | 問題 |
|------|------|
| Stripe 最低交易金額 | Stripe 要求最低 $0.50 USD（或各幣種最低），套餐定價需考慮 |
| `quota_remaining` 整數溢位 | 若用戶反覆充值，bigint 理論上不會溢位，但要確認 |
| 金額精度 | 以分（cents）為單位儲存，避免浮點數誤差 |

**關鍵問題**：套餐定價金額和 token 數量是否需要在 DB 設定（動態），或是 hardcode 在程式碼中？

### 維度 4：網路/外部（Stripe 依賴）

| 情境 | 問題 |
|------|------|
| Stripe 服務故障 | `/billing/checkout` 呼叫 Stripe API 失敗 → 前端顯示錯誤，用戶無法儲值 |
| Webhook endpoint 短暫不可用 | Stripe 重試機制（1h, 5h, 10h, 24h, 2d, 3d, 5d）→ 最多 7 天 → 7 天後放棄，需要對帳機制 |
| Stripe Webhook 簽名驗證失敗 | 收到非 Stripe 來源的假 Webhook → 回傳 400，拒絕處理 |

**關鍵問題**：是否需要 Stripe Dashboard 的人工對帳功能（Admin 可觸發補充 quota），以應對 Webhook 遺失？

### 維度 5：業務邏輯

| 情境 | 問題 |
|------|------|
| 退款處理 | 用戶向信用卡公司 chargeback 或向 Stripe 申請退款 → `charge.refunded` 事件 → 是否需要扣回 quota？ |
| 套餐更換 | 用戶在跳轉到 Stripe 頁面後，能否更換套餐？（通常 Stripe Checkout 固定了金額，重新建立 session 即可）|
| 已使用 token 的退款 | 用戶買了 100K tokens，用了 50K 然後申請退款 → 退 50% 還是全額？|

**關鍵問題**：是否需要處理退款？若需要，退款邏輯是什麼？

### 維度 6：UI/體驗

| 情境 | 問題 |
|------|------|
| 跳轉到 Stripe 後關閉瀏覽器 | cancel_url 設定後用戶返回 = 放棄付款，無副作用 |
| success_url 返回後 quota 未更新 | Webhook 延遲 → 用戶看到舊的 quota → 前端需要 loading/刷新機制或 pending 狀態提示 |
| 手機 Stripe 跳轉 | 部分 mobile browser 跳出 Stripe 頁面後返回路由可能異常 |

**關鍵問題**：儲值成功頁需要「自動輪詢額度更新」還是「手動點擊刷新」？

---

## 6. 對現有系統的影響評估

### 影響範圍（初步）

**不需改動的現有部分**：
- `reserve_quota` / `settle_quota` SQL functions（方案 A）
- `/v1/chat/completions` proxy 邏輯
- `/auth/`, `/keys/` routes
- API Key 驗證機制

**需要新增的部分**：
- 後端：`/billing/checkout`, `/billing/history`, `/stripe/webhook` routes
- 後端：`StripeService`（封裝 Stripe SDK 呼叫）
- DB：`payment_history` 表
- DB：套餐定價設定（DB 表 or config）
- 前端：儲值頁（套餐選擇 + 歷史記錄）
- 環境變數：`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`

**可能影響的現有部分**（視方案而定）：
- 方案 B：`user_quotas` 表結構、`reserve_quota`/`settle_quota` SQL functions
- Admin Web UI：可能需要在配額管理頁顯示充值記錄

### 技術約束

- Stripe Webhook endpoint 必須是公開 HTTP endpoint（不能是 Supabase Function，因為現有後端跑在 Fly.io）
- Stripe Webhook Secret 不能 commit 到 repo
- 需要本地開發時的 Stripe CLI 轉發（`stripe listen --forward-to localhost:3000/stripe/webhook`）

---

## 7. Spec Mode 判斷

**決定：Full Spec**

理由：
1. 涉及金流（高風險，需完整文件化）
2. 需要新增 DB schema（payment_history 表）
3. 新增多個後端 API endpoints（billing + stripe webhook）
4. 新增前端頁面（儲值頁）
5. 與現有 user_quotas 機制有整合點
6. 六維度例外情境豐富（Stripe webhook 冪等、退款、延遲等）

---

## 8. 需要用戶確認的關鍵問題

以下 5 個問題影響設計方向，需要在產出 brief_spec 前確認：

---

**Q1（最重要）：儲值模式選擇**

這直接決定架構方向：

- **選項 A：Token 套餐制**（推薦 Phase 2 起步）
  用戶選購套餐（如 100K tokens = $5），付款後直接加到 quota_remaining。
  改動最小，不動現有 proxy/quota 邏輯。

- **選項 B：信用餘額制**（彈性但複雜）
  用戶任意儲值金額（如 $10），系統依各模型費率計算每次請求費用並扣款。
  需要新增 pricing_config 表、改寫 reserve/settle quota 邏輯。

你傾向哪個方向？

---

**Q2：FA-B 的範圍邊界——是否包含「自動計費扣款」？**

原始定義包含兩件事：
1. 金流自助儲值（用戶付錢）
2. 自動計費扣款系統（每次請求自動扣）

目前 MVP 已有樂觀預扣（reserve_quota/settle_quota），以 token 為單位。如果選方案 A（Token 套餐），現有預扣機制已足夠，不需要改。如果選方案 B，才需要改計費邏輯。

這次要做的是：
- 只做「用戶能自己儲值」就夠（現有 token 扣款機制不動）？
- 還是要做到「精確按金額計費，每次請求扣美金而非扣 token」？

---

**Q3：退款政策**

Stripe 可以處理退款（refund），但業務邏輯需要明確：
- 是否需要支援退款功能（在 Admin UI 中觸發退款）？
- 如果支援退款，已消耗的 token/credit 如何處理（全退 / 按比例退）？
- 如果不支援退款，儲值說明要標示「儲值不退款」。

---

**Q4：套餐定價（僅方案 A 適用）**

- 有哪些套餐？金額和對應 token 數量是多少？
- 套餐是否需要動態調整（Admin 可在後台設定），還是先 hardcode 在程式碼中？
- 幣種（USD / TWD / 其他）？

---

**Q5：Webhook 失敗的補償機制**

Stripe Webhook 理論上最多重試 7 天，但如果 endpoint 長時間掛掉：
- 是否需要 Admin 在後台手動補充 quota（作為 fallback）？
- 是否需要定期對帳（比對 Stripe Dashboard 的付款記錄 vs DB 的 payment_history）？

（若不需要，接受「Webhook 失敗 = 用戶需要聯繫 Admin 手動補」的做法）

---

## 9. 初步工作量估算（待確認方案後精確化）

| 方案 | 複雜度 | 估算 Tasks | 備註 |
|------|--------|-----------|------|
| 方案 A（Token 套餐制） | M | ~8-10 tasks | 最小改動路徑 |
| 方案 B（信用餘額制） | L | ~12-15 tasks | 涉及核心 quota 改動 |

---

> 確認以上問題後，將正式產出 `s0_brief_spec.md` 並建立 `sdd_context.json`。
