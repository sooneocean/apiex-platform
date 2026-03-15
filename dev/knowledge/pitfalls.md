# Pitfalls Registry

> 自動追加於 S5/S6/S7 階段。詳見 sop-full-spec.md 知識管理章節。

## CLI / API 介面合約

- CLI 命令實作後必須對照 API Spec 驗證 request/response 欄位名稱一致性
  — apiex-platform (2026-03)

## Adapter / Streaming

- Adapter streaming 層的 chunk.data 型別需確認是 string 還是 parsed object
  — apiex-platform (2026-03)

## 前後端參數命名

- 前後端分頁參數命名必須一致（per_page vs limit vs page_size）
  — apiex-platform (2026-03)

## Supabase JS Client 陷阱

- Supabase JS `.update({ col: val })` 是 SET 不是 INCREMENT — 需要原子累加時必須用 SQL function + `.rpc()`
  — stripe-topup (2026-03)

## Stripe 整合

- Stripe Webhook 的 `amount_total` 單位是 cents（整數），前端顯示時需 /100 轉換
  — stripe-topup (2026-03)

## Rate Limiting

- In-memory rate limiter 重啟歸零 — 生產環境需評估 Redis 升級時機
  — rate-limiting (2026-03)

## Analytics / 聚合查詢

- usage_logs 無 user_id 欄位，per-user 聚合需 JOIN api_keys — 考慮 denormalize 或物化視圖
  — analytics-dashboard (2026-03)
- Tremor v3 不支援 Tailwind v4 — 用 Recharts 替代
  — analytics-dashboard (2026-03)

## Webhook 通知

- 通知 dedup 需要複合索引 (event_type, key_id, created_at DESC)，否則每次請求都全表掃描
  — webhook-notify (2026-03)
- fire-and-forget 通知不能阻塞 proxy 請求 — 永遠用 .catch(console.error)
  — webhook-notify (2026-03)
- S4 完成所有 Task commit 後，必須同步更新 sdd_context.json 的 s4 output，否則後續 Stage 無法正確恢復
  — webhook-notify-v2 (2026-03)

## React Hooks / 前端效能

- 手寫 debounce (useRef + setTimeout) 必須配合 useEffect cleanup，否則元件 unmount 後 setState 導致 memory leak — 建議用 `useEffect(() => () => clearTimeout(ref.current), [])` 確保清理
  — dashboard-ux-polish (2026-03)
