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
