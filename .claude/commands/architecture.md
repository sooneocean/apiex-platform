---
description: "系統架構文件生成 - 分析專案架構並產出 ARCHITECTURE.md。觸發：「架構文件」、「architecture」、「系統架構」、「更新架構」、「架構分析」"
allowed-tools: Read, Bash, Grep, Glob, Write, Edit, mcp__sequential-thinking__sequentialthinking
argument-hint: "[force]"
---

# /architecture — 系統架構文件生成

> 不觸發 SOP 管線、不寫 sdd_context。掃描專案後產出（或更新）`ARCHITECTURE.md`。

## 環境資訊

- 當前分支: !`git branch --show-current`
- 工作目錄: !`pwd`

## 輸入

參數：$ARGUMENTS

- **無參數**（標準模式）：若已有 `ARCHITECTURE.md`，先比對差異、等待用戶確認後再覆寫。
- **`force`**：跳過差異比對，直接覆寫。

---

## 流程

### Phase 1：深度掃描

用 sequential-thinking 組織掃描計畫，依序執行以下子步驟。

#### 1.1 技術棧偵測

掃描專案根目錄及子目錄，偵測以下設定檔並推斷技術棧：

| 設定檔 | 技術 |
|--------|------|
| `package.json` | Node.js / npm |
| `tsconfig.json` | TypeScript |
| `next.config.*` | Next.js |
| `nuxt.config.*` | Nuxt |
| `vite.config.*` | Vite |
| `angular.json` | Angular |
| `pubspec.yaml` | Flutter / Dart |
| `*.csproj` / `*.sln` | .NET |
| `requirements.txt` / `pyproject.toml` / `Pipfile` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `Gemfile` | Ruby |
| `pom.xml` / `build.gradle` | Java / Kotlin |
| `docker-compose.yml` / `Dockerfile` | Docker |
| `vercel.json` / `netlify.toml` | 雲端部署 |
| `prisma/schema.prisma` | Prisma ORM |
| `drizzle.config.*` | Drizzle ORM |
| `.env*` | 環境變數（僅偵測存在，不讀取內容） |

> 不限於上表。遇到其他辨識度高的設定檔也應記錄。

#### 1.2 目錄結構分析

```bash
find . -type d \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*' \
  -not -path '*/.next/*' \
  -not -path '*/.nuxt/*' \
  -not -path '*/__pycache__/*' \
  -not -path '*/vendor/*' \
  -not -path '*/.dart_tool/*' \
  -not -path '*/bin/Debug/*' \
  -not -path '*/bin/Release/*' \
  -not -path '*/obj/*' \
  | head -80
```

對每個主要目錄標註其角色（如：路由層、元件層、服務層、工具類、設定、文件等）。

#### 1.3 進入點識別

依技術棧搜尋常見進入點：

- `src/index.*`、`src/main.*`、`src/app.*`
- `pages/`、`app/` 目錄（Next.js / Nuxt）
- `lib/main.dart`（Flutter）
- `Program.cs`、`Startup.cs`（.NET）
- `main.go`（Go）
- `main.py`、`app.py`、`manage.py`（Python）
- `server.js`、`server.ts`（Node.js）
- 其他顯著的啟動檔

#### 1.4 分層架構辨識

將掃描結果歸類為以下分層（無對應內容的層標記為不適用）：

| 分層 | 說明 |
|------|------|
| 前端 / UI | 頁面、元件、樣式、狀態管理 |
| API / 路由 | REST endpoints、GraphQL schema、RPC 定義 |
| 業務邏輯 | Services、Use Cases、Domain Models |
| 資料層 | ORM、Repository、Migration、Schema |
| 外部整合 | 第三方 API、SDK、Message Queue |
| 基礎設施 | Docker、CI/CD、部署配置、監控 |

#### 1.5 核心功能掃描

從以下來源萃取核心功能清單：

- 路由定義（routes、pages 目錄結構）
- 模組/服務命名（services、controllers、handlers）
- `README.md`、`CLAUDE.md` 中的功能描述
- 測試檔案命名（反映被測功能）

#### 1.6 部署架構偵測

掃描以下部署相關檔案：

- `Dockerfile`、`docker-compose.yml`
- `.github/workflows/`、`.gitlab-ci.yml`、`Jenkinsfile`
- `vercel.json`、`netlify.toml`、`fly.toml`、`railway.toml`
- `Procfile`（Heroku）
- `k8s/`、`helm/`（Kubernetes）
- `terraform/`、`pulumi/`（IaC）

---

### Phase 2：比對差異（條件性）

**觸發條件**：`ARCHITECTURE.md` 已存在 **且** 參數不是 `force`。

若條件不符，跳至 Phase 3。

1. 讀取現有 `ARCHITECTURE.md` 全文。
2. 將 Phase 1 掃描結果與現有文件逐章節比對：
   - **新增**：掃描發現但文件中未記載的技術、目錄、功能。
   - **移除**：文件中記載但掃描未發現的項目（可能已刪除）。
   - **變更**：兩邊都有但內容不一致的項目。
3. 向用戶報告差異摘要：

```
## ARCHITECTURE.md 差異比對

### 新增（掃描發現，文件未記載）
- {項目}

### 可能已移除（文件記載，掃描未發現）
- {項目}

### 變更（內容不一致）
- {章節}：{差異描述}

是否覆寫 ARCHITECTURE.md？[Y/n]
```

4. **等待用戶確認**後才進入 Phase 3。若用戶拒絕，中止流程。

---

### Phase 3：產出文件

#### 3.1 寫入 ARCHITECTURE.md

在專案根目錄寫入（或覆寫）`ARCHITECTURE.md`，使用以下固定結構：

```markdown
# 系統架構文件

> 自動產生於 {YYYY-MM-DD}，由 `/architecture` 指令生成。

## 系統概覽

{一段話描述系統用途、目標使用者、核心價值。}

## 技術棧

| 類別 | 技術 | 版本 | 說明 |
|------|------|------|------|
| {前端/後端/資料庫/...} | {名稱} | {版本} | {用途} |

## 目錄結構

{tree 格式，標註各目錄角色}

## 系統分層架構

{依 Phase 1.4 的分層，描述各層職責與邊界}

## 核心功能清單

| # | 功能 | 模組/路徑 | 說明 |
|---|------|----------|------|
| 1 | {功能名} | {對應程式碼位置} | {簡述} |

## API / 路由總覽

{列出主要 API endpoints 或頁面路由，按模組分組}

## 資料流

{描述關鍵業務流程的資料流向：使用者操作 → 前端 → API → 服務 → 資料庫}

## 外部整合

| 服務 | 用途 | 整合方式 |
|------|------|---------|
| {第三方服務名} | {用途} | {SDK / REST API / Webhook / ...} |

## 部署架構

{描述部署方式、環境、CI/CD 流程}

## 開發指南

{對新進開發者的重點提示：本地開發啟動方式、重要慣例、常見陷阱}
```

**空章節處理**：若某章節掃描後確實無對應內容，保留章節標題並標註「（本專案不適用）」或「（待補充）」。不要刪除章節。

#### 3.2 冪等更新 CLAUDE.md

1. 搜尋 `CLAUDE.md` 中是否已存在 `ARCHITECTURE.md` 的引用（Grep 搜尋 `ARCHITECTURE.md`）。
2. **若已存在**：不做任何修改。
3. **若不存在**：在 `# Repository Guidelines` 標題之後、`## Project Structure` 標題之前，插入以下行：

```markdown

> 系統架構總覽見 `ARCHITECTURE.md`

```

> 使用 Edit tool 精確插入，不影響其他內容。

---

## 輸出格式

流程完成後，輸出以下完成報告：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/architecture 完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ ARCHITECTURE.md — {新建 / 已更新}
✅ CLAUDE.md 引用 — {已新增 / 已存在，跳過}

偵測到的技術棧：{列表}
文件章節數：{n} / 10
標記待補充：{n} 個章節

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 使用範例

```
# 標準模式：有舊檔會比對差異
/architecture

# 強制模式：跳過比對，直接覆寫
/architecture force
```

---

## 安全規則

- 不觸發 SOP 管線、不寫 sdd_context
- 不讀取 `.env` 檔案內容（僅偵測檔案存在）
- 不修改 `ARCHITECTURE.md` 和 `CLAUDE.md` 以外的檔案
- `CLAUDE.md` 更新為冪等操作：已有引用則不重複插入
