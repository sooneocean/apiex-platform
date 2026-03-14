# Supabase Setup

## 本地開發

1. 安裝 Supabase CLI：
   ```bash
   brew install supabase/tap/supabase
   ```

2. 啟動本地 Supabase（需 Docker）：
   ```bash
   supabase init
   supabase start
   ```

3. 執行 migrations：
   ```bash
   supabase db reset
   ```

4. 套用 seed 資料：
   ```bash
   supabase db reset  # 會自動執行 seed.sql
   ```

## 遠端部署

1. 連結到 Supabase 專案：
   ```bash
   supabase link --project-ref <your-project-ref>
   ```

2. 推送 migrations：
   ```bash
   supabase db push
   ```

3. 手動執行 seed（僅首次）：
   在 Supabase Dashboard > SQL Editor 執行 `seed.sql`

## 環境變數

複製 `.env.example` 到 `.env` 並填入：
```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

## 表結構

- `api_keys`: API Key 儲存（sha256 hash）、狀態、配額
- `user_quotas`: 用戶級別預設配額（管理員設定）
- `usage_logs`: 請求用量記錄
- `route_config`: 路由標籤對應上游 LLM 設定
