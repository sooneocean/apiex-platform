# S0 Brief Spec — Webhook 配額告警通知

**版本**：v1.0.0
**日期**：2026-03-15
**狀態**：completed

---

## 需求摘要

當用戶的 API Key 配額（`quota_tokens`）消耗達到特定閾值（80%、90%、100%）時，系統自動推播 HTTP Webhook 通知給用戶設定的端點。用戶可在 Portal UI 上管理 Webhook 設定。

---

## 使用者故事

- **身為** API 平台用戶
- **我希望** 當我的配額快用完時收到通知
- **以便** 及時儲值或減少使用，避免服務中斷

---

## 功能範圍

### 核心功能
1. 用戶可設定最多一組 Webhook URL（可含可選的 HMAC secret）
2. 系統在每次 API 請求結算後，檢查 key 的配額消耗比例
3. 當消耗達到 80%、90%、100% 時，觸發 Webhook 推播
4. 防重複機制：同一 key + 同一閾值，24 小時內只發一次
5. 所有推播嘗試記錄到 `webhook_logs`（含 status_code、response_body）
6. 用戶可在 Portal 查看推播記錄與測試 Webhook

### 排除範圍
- 不支援多組 Webhook（每個用戶一組）
- 不支援自訂閾值（固定 80%/90%/100%）
- 不支援 Retry 機制（fire-and-forget，失敗記 log 但不重試）

---

## 技術設計摘要

### DB Schema

**`webhook_configs`** — 用戶 Webhook 設定
- `id` UUID PK
- `user_id` UUID REFERENCES auth.users（唯一，每用戶一條）
- `url` TEXT NOT NULL
- `secret` TEXT（可選，用於 HMAC-SHA256 簽名）
- `events` TEXT[] DEFAULT `{quota_warning}`
- `is_active` BOOLEAN DEFAULT true
- `created_at` TIMESTAMPTZ

**`webhook_logs`** — 推播記錄
- `id` UUID PK
- `webhook_config_id` UUID REFERENCES webhook_configs
- `event` TEXT（`quota_warning`）
- `payload` JSONB
- `status_code` INTEGER（`null` 表示網路錯誤）
- `response_body` TEXT
- `created_at` TIMESTAMPTZ

**防重複機制**：使用 `webhook_logs` 查詢過去 24 小時同一 `key_id + threshold` 是否已發送。

### 核心服務

**`WebhookService`**（`packages/api-server/src/services/WebhookService.ts`）
- `getConfig(userId)` — 查詢 webhook 設定
- `upsertConfig(userId, url, secret?, events?)` — 建立或更新設定
- `deleteConfig(userId, configId)` — 刪除設定
- `sendNotification(userId, event, payload)` — 發送 HTTP POST + 記錄 log
- `checkAndNotifyQuota(userId, keyId, quotaTokens, currentUsed)` — 閾值檢查 + 去重 + 觸發

### Webhook Payload 格式

```json
{
  "event": "quota_warning",
  "threshold": 80,
  "key_id": "uuid",
  "quota_tokens": 100000,
  "used_tokens": 80500,
  "usage_percent": 80.5,
  "timestamp": "2026-03-15T12:00:00Z"
}
```

簽名 Header：`X-Webhook-Signature: sha256=<hmac_hex>`

### Proxy 整合

在 `proxy.ts` 的 `settleQuota` 之後，fire-and-forget 調用 `checkAndNotifyQuota`，不阻塞主流程。

### API Routes（`/webhooks/*`，supabaseJwtAuth）

| Method | Path | 說明 |
|--------|------|------|
| GET | `/webhooks` | 列出用戶 webhook 設定 |
| POST | `/webhooks` | 建立/更新 webhook 設定（upsert） |
| DELETE | `/webhooks/:id` | 刪除設定 |
| GET | `/webhooks/:id/logs` | 查看推播記錄 |
| POST | `/webhooks/test` | 發送測試推播 |

---

## 成功標準

1. 三個閾值（80/90/100%）各觸發一次 Webhook 推播
2. 24 小時內同閾值不重複推播
3. 所有推播結果（含失敗）記錄在 webhook_logs
4. 前端可設定 URL、測試、查看記錄
5. 單元測試覆蓋閾值邏輯與 sendNotification mock

---

## 風險與注意事項

- **外部 HTTP 延遲**：checkAndNotifyQuota 為 fire-and-forget，不影響 API 回應時間
- **secret 安全**：secret 存明文於 DB，建議 RLS 限制只有 owner 可讀
- **配額計算**：`currentUsed` 來自 proxy 的 `usage.total_tokens`，是本次請求的 token 數，不是累計用量。需要從 DB 查詢 key 的實際剩餘 `quota_tokens` 來計算消耗比例
