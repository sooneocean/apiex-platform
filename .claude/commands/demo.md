---
description: "Demo 環境 - 啟動 dev server + Cloudflare Tunnel，產生公開 HTTPS URL 供測試。觸發：「demo」、「tunnel」、「開隧道」、「測試環境」"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
argument-hint: "[start | stop | status | restart]"
---

# /demo — Dev Server + Cloudflare Tunnel

> 啟動本地開發伺服器並透過 Cloudflare Tunnel 產生公開 HTTPS URL。
> 預設使用 `kiwedogo` Named Tunnel（`*.kiwedogo.com`）；特殊專案可指定 `wonderland-eternal`（`*.wonderland-eternal.com`）。

## 環境資訊
- 當前分支: !`git branch --show-current`

## 輸入
$ARGUMENTS

---

## Mode Router

根據 `$ARGUMENTS` 判斷執行模式：

| 輸入 | Mode | 行為 |
|------|------|------|
| 空 / `start` | **START** | 啟動 dev server + 確認 tunnel，輸出 URL |
| `stop` | **STOP** | 關閉 dev server（Named Tunnel 共用不停） |
| `status` | **STATUS** | 顯示當前 tunnel 狀態與 URL |
| `restart` | **RESTART** | stop → start |

---

## tunnel.json Schema

設定檔位於 `.claude/tunnel.json`：

```json
{
  "command": "<dev-server-start-command>",
  "port": 3000,
  "wait_seconds": 5,
  "tunnel_name": "kiwedogo",
  "public_url": "https://<subdomain>.kiwedogo.com",
  "cloudflared_config": "~/.cloudflared/config-kiwedogo.yml"
}
```

| 欄位 | 必填 | 預設 | 說明 |
|------|------|------|------|
| `command` | 是 | — | 啟動 dev server 的指令 |
| `port` | 是 | — | dev server port |
| `wait_seconds` | 否 | `5` | 啟動後等候秒數 |
| `tunnel_name` | 否 | `"kiwedogo"` | Named Tunnel 名稱；`null` = Quick Tunnel（臨時） |
| `public_url` | Named 必填 | — | Named Tunnel 的固定公開 URL |
| `cloudflared_config` | 否 | `~/.cloudflared/config-<tunnel_name>.yml` | cloudflared 設定檔路徑 |

### 已配置的 Named Tunnel

| Tunnel | 域名 | Config |
|--------|------|--------|
| `kiwedogo` | `*.kiwedogo.com` | `~/.cloudflared/config-kiwedogo.yml` |
| `wonderland-eternal` | `*.wonderland-eternal.com` | `~/.cloudflared/config-wonderland-eternal.yml` |

---

## START Mode

### Step 1：讀取設定

讀取 `.claude/tunnel.json`。

如果檔案不存在，執行 **SETUP 流程**：
1. 使用 AskUserQuestion 依序詢問：
   - 「啟動 dev server 的指令是什麼？（例如 `npm run dev`、`flutter run -d chrome`、`dotnet run`）」
   - 「dev server 的 port 是多少？（例如 3000、8080、5173）」
   - 「subdomain 要叫什麼？（輸入名稱 → `<name>.kiwedogo.com`）。如需 wonderland-eternal.com，請加前綴 `we:<name>`」
2. 解析域名：
   - 一般輸入（如 `my-app`）→ `tunnel_name: "kiwedogo"`, `public_url: "https://my-app.kiwedogo.com"`, `cloudflared_config: "~/.cloudflared/config-kiwedogo.yml"`
   - `we:` 前綴（如 `we:local-api`）→ `tunnel_name: "wonderland-eternal"`, `public_url: "https://local-api.wonderland-eternal.com"`, `cloudflared_config: "~/.cloudflared/config-wonderland-eternal.yml"`
3. 建立 `.claude/tunnel.json`：
   ```json
   {
     "command": "<用戶回答>",
     "port": "<用戶回答>",
     "wait_seconds": 5,
     "tunnel_name": "<tunnel_name>",
     "public_url": "<public_url>",
     "cloudflared_config": "<config_path>"
   }
   ```
4. 告知用戶：「已建立 `.claude/tunnel.json`，後續可直接編輯此檔調整設定。」
5. 繼續 Step 2。

### Step 2：前置檢查

```bash
which cloudflared
```

如果找不到，輸出以下訊息並中止：
```
cloudflared 未安裝。請先安裝：
  macOS:   brew install cloudflared
  Linux:   見 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

### Step 3：DNS / Ingress 檢查（Named Tunnel 限定）

如果 `tunnel_name` 不是 `null`：

1. 從 `public_url` 提取 hostname（例如 `my-app.kiwedogo.com`）
2. 讀取 `cloudflared_config` 檔案
3. 檢查 ingress 是否包含該 hostname：
   ```bash
   grep -q "<hostname>" <cloudflared_config>
   ```

**如果 hostname 不存在** → 輸出 DNS 新增引導並中止：

```
⚠️  hostname「<hostname>」尚未在 cloudflared 設定中。請依序執行：

1️⃣  編輯 <cloudflared_config>，在最後一行 `- service: http_status:404` 之前新增：

    - hostname: <hostname>
      service: http://localhost:<port>

2️⃣  新增 DNS 路由：

    cloudflared tunnel route dns <tunnel_name> <hostname>

3️⃣  重啟 tunnel（若正在運行）：

    # 找到現有 process
    pgrep -f "cloudflared.*<tunnel_name>"
    # 停止
    kill <pid>
    # 重新啟動
    nohup cloudflared tunnel --config <cloudflared_config> --no-autoupdate run <tunnel_name> > /tmp/demo-tunnel.log 2>&1 &

完成後再次執行 /demo 即可。
```

**如果 hostname 存在** → 繼續。

### Step 4：檢查 Port 佔用

```bash
lsof -ti:<port>
```

- 有 PID → 使用 AskUserQuestion：「Port <port> 已被佔用（PID: <pid>）。是否直接對現有服務開 tunnel？」
  - 是 → 跳到 Step 6（不啟動 dev server）
  - 否 → 中止
- 無 PID → 繼續 Step 5

### Step 5：啟動 Dev Server

```bash
nohup <command> > /tmp/demo-server.log 2>&1 &
echo $!
```

記錄 server PID。等待 `wait_seconds` 秒後，檢查 process 是否存活：

```bash
kill -0 <server_pid> 2>/dev/null && echo "alive" || echo "dead"
```

- alive → 繼續
- dead → 讀取 `/tmp/demo-server.log` 最後 20 行，輸出錯誤訊息，中止

### Step 6：確認 Tunnel 運行

根據 `tunnel_name` 決定行為：

**Named Tunnel（tunnel_name 有值）：**

檢查 Named Tunnel 是否已在運行：
```bash
pgrep -f "cloudflared.*tunnel.*run.*<tunnel_name>"
```

- **已在運行** → 直接使用，跳到 Step 7
- **未運行** → 啟動：
  ```bash
  nohup cloudflared tunnel --config <cloudflared_config> --no-autoupdate run <tunnel_name> > /tmp/demo-tunnel.log 2>&1 &
  echo $!
  ```
  等待 10 秒，確認 process 存活。

URL 來源：直接使用 `tunnel.json` 中的 `public_url`。

**Quick Tunnel（tunnel_name 為 null）：**
```bash
nohup cloudflared tunnel --no-autoupdate --url http://localhost:<port> > /tmp/demo-tunnel.log 2>&1 &
echo $!
```

等待最多 30 秒，每 2 秒檢查一次 log 中是否出現 URL：

```bash
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/demo-tunnel.log
```

- 找到 URL → 繼續 Step 7
- 30 秒超時 → 輸出 log 最後 10 行，kill tunnel process，中止

### Step 7：寫入 PID 檔 + 輸出結果

建立 `.claude/tunnel.pid.json`：
```json
{
  "server_pid": "<server_pid or null>",
  "tunnel_pid": "<tunnel_pid or null>",
  "port": "<port>",
  "url": "<public_url 或 Quick Tunnel URL>",
  "started_at": "<ISO timestamp>"
}
```

輸出：
```
🚀 Demo 環境已啟動

├── Dev Server:  <command> (PID: <server_pid>)
├── Port:        <port>
├── Tunnel:      <url>
├── Tunnel Type: Named（<tunnel_name>）/ Quick Tunnel
└── Config:      <cloudflared_config>

👉 點擊測試：<url>

停止：/demo stop
狀態：/demo status
```

---

## STOP Mode

### Step 1：讀取 PID 檔

讀取 `.claude/tunnel.pid.json`。不存在 → 輸出「沒有運行中的 demo 環境。」，結束。

### Step 2：終止程序

讀取 `.claude/tunnel.json` 判斷 tunnel 類型。

**Dev Server（必定停止）：**
```bash
kill <server_pid> 2>/dev/null
```

**Tunnel Process：**
- **Named Tunnel** → 不停止（共用 tunnel，其他專案可能在用）。輸出提示：「Named Tunnel（<tunnel_name>）為共用服務，不自動停止。如需手動停止：`kill $(pgrep -f "cloudflared.*<tunnel_name>")`」
- **Quick Tunnel** → 停止：
  ```bash
  kill <tunnel_pid> 2>/dev/null
  ```

等待 3 秒，檢查 dev server 是否真的關了：
```bash
kill -0 <server_pid> 2>/dev/null && echo "alive" || echo "dead"
```

還活著 → `kill -9`。

### Step 3：清理

刪除 `.claude/tunnel.pid.json`。
清理 log 檔：`rm -f /tmp/demo-server.log /tmp/demo-tunnel.log`

輸出：
```
🛑 Demo 環境已關閉

├── Dev Server: 已停止
├── Tunnel:     <Named: 保持運行（共用） / Quick: 已停止>
└── 清理完成
```

---

## STATUS Mode

### Step 1：讀取 PID 檔

讀取 `.claude/tunnel.pid.json`。不存在 → 輸出「沒有運行中的 demo 環境。」，結束。

### Step 2：檢查程序狀態

```bash
kill -0 <server_pid> 2>/dev/null && echo "server: alive" || echo "server: dead"
```

Named Tunnel：
```bash
pgrep -f "cloudflared.*tunnel.*run.*<tunnel_name>" > /dev/null && echo "tunnel: alive" || echo "tunnel: dead"
```

Quick Tunnel：
```bash
kill -0 <tunnel_pid> 2>/dev/null && echo "tunnel: alive" || echo "tunnel: dead"
```

### Step 3：輸出

```
📊 Demo 環境狀態

├── Dev Server:  <command> (PID: <server_pid>) — ✅ 運行中 / ❌ 已停止
├── Port:        <port>
├── Tunnel:      <url> — ✅ 運行中 / ❌ 已停止
├── Tunnel Type: Named（<tunnel_name>）/ Quick Tunnel
├── Config:      <cloudflared_config>
└── 啟動時間:    <started_at>

👉 測試：<url>
```

如果有 dead process → 提示「部分程序已停止，建議 `/demo restart`。」

---

## RESTART Mode

依序執行 STOP → START。

---

## 注意事項

- `tunnel.json` 應加入版控（專案設定）
- `tunnel.pid.json` 不應加入版控（runtime 產物，請加入 `.gitignore`）
- Named Tunnel（`kiwedogo`、`wonderland-eternal`）為共用服務，`/demo stop` 只停 dev server
- Quick Tunnel URL 每次啟動都不同，無法固定
- Named Tunnel 需要事先用 `cloudflared tunnel create <name>` 建立並認證
- 新增 Named Tunnel 服務需要 DNS 設定，`/demo` 會自動檢測並引導
- 預設 log 位置：`/tmp/demo-server.log`、`/tmp/demo-tunnel.log`
