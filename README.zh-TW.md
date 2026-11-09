# ado-cli

[English README](README.md)

輕量的 Azure DevOps CLI 工具，用於 Sprint 與 Work Item 操作。設計為中介層，讓 AI 代理（如 Claude Code）能操作 Azure DevOps **而不需要直接接觸你的 PAT**。

支援**跨組織、跨專案**操作 — PAT 只需在 `.env` 設定一次，org/project 由每次指令的 flag 指定。

## 功能

- **Sprint** — 查詢當前 Sprint、列出 Sprint、檢視 Sprint 內的工作項目
- **Work Items** — 建立、更新、關閉、指派、刪除、留言、查詢
- **複合指令** — `create-card` 一步完成 Issue + Task + commit 關聯
- **Commit 關聯** — 將 git commit 連結到 Work Item
- **Repo 資訊** — 從 git remote URL 解析 Azure DevOps 的 project/repo GUID
- **跨組織** — `--org` 和 `--project` flag 支援跨組織/專案操作
- **乾淨 JSON 輸出** — 所有指令輸出 JSON，方便程式解析

## 快速開始

```bash
# 1. 下載並安裝 CLI
git clone https://github.com/bensonbs/ado-cli.git
cd ado-cli
npm install
npm link

# 2. 設定 .env
cp .env.example .env
# 編輯 .env：設定 ADO_PAT、ADO_ORG、ADO_PROJECT

# 3. 安裝 Claude Code skill（選用但建議）
./install-skill.sh

# 4. 驗證
ado whoami
```

完成。你現在有全域的 `ado` 指令，以及 Claude Code 中的 `/ado` 和 `/ado-pr` skill。

## 安裝細節

### 步驟 1 — CLI 工具

```bash
git clone https://github.com/bensonbs/ado-cli.git
cd ado-cli
npm install
npm link    # 讓 `ado` 全域可用
```

### 步驟 2 — PAT 設定

```bash
cp .env.example .env
```

編輯 `.env`：

```
ADO_PAT=your-personal-access-token
ADO_ORG=your-organization
ADO_PROJECT=your-project-name
```

`ADO_ORG` 和 `ADO_PROJECT` 是選用的預設值，隨時可用 `--org` / `--project` flag 覆蓋。

#### 取得 PAT

1. 前往 `https://dev.azure.com/{你的組織}/_usersSettings/tokens`
2. 建立新 token，勾選 **Work Items（讀取和寫入）** 和 **Code（讀取）** 範圍
3. 將 token 複製到 `.env` 檔

> **安全性**：`.env` 已被 git ignore，不會進入版本控制。

### 步驟 3 — Claude Code Skill（選用）

如果你使用 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)，安裝 agent skill 讓 Claude 可以自主操作 `ado`：

```bash
# 全域安裝 — 所有專案都可用
./install-skill.sh
```

或只安裝到特定專案：

```bash
mkdir -p your-project/.claude/skills/ado
cp .claude/skills/ado/SKILL.md your-project/.claude/skills/ado/
```

安裝後：
- `/ado` 可作為 slash command，用於 sprint 和 work item 操作
- `/ado-pr` 可作為 slash command，用於建立 Pull Request
- 當你提到 sprint、work item、ADO 時，Claude 會自動載入此 skill

## 全域選項

所有指令都支援以下 flag：

| Flag | 說明 |
|------|------|
| `--org <org>` | Azure DevOps 組織名稱（預設讀取 `.env` 的 `ADO_ORG`） |
| `--project <project>` | Azure DevOps 專案名稱（預設讀取 `.env` 的 `ADO_PROJECT`） |
| `--area <area>` | Area path（預設讀取 `ADO_AREA_PATH` 或等同 `--project`） |
| `--pat <token>` | 覆蓋 `.env` 裡的 PAT |

```bash
# 使用 .env 預設值
ado sprint current

# 覆蓋為不同的組織/專案
ado --org OtherOrg --project OtherProject wi list --state Active
```

## 使用方式

### Sprint

```bash
# 取得當前 Sprint
adosprint current

# 列出所有 Sprint（篩選：past, current, future）
adosprint list --timeframe current

# 列出當前 Sprint 的工作項目
adosprint workitems
```

### Work Items — 建立

```bash
# 建立 Issue
adowi create-issue --title "改善：登入流程"

# 建立 Task 並關聯到 parent Issue
adowi create-task --title "新增匯出按鈕" --parent 1234

# 建立 Task 並附上 HTML 說明
adowi create-task \
  --title "修正逾時問題" \
  --description "<p>將 timeout 從 30 秒調整為 60 秒</p>" \
  --parent 1234
```

### Work Items — 開卡片（複合指令）

一個指令完成 Issue + Task + commit 關聯：

```bash
adowi create-card \
  --issue-title "改善：檔案上傳穩定性" \
  --task-title "修正上傳逾時" \
  --task-description "<p>根因：30 秒 timeout 不足</p>" \
  --iteration "Project\Sprint 2026-05" \
  --project-id <guid> --repo-id <guid> --commit <sha>
```

### Work Items — 查詢

```bash
# 查詢單一 Work Item
adowi get 1234

# 依條件列出 Work Items
adowi list --iteration "Project\Sprint 2026-05"
adowi list --state Active --type Task
adowi list --assigned-to "王小明"

# WIQL macro 不加引號直接帶入
ado wi list --assigned-to @Me --iteration @CurrentIteration

# 列出父項目的所有子項
adowi children 1234

# 執行自訂 WIQL 查詢
adowi query "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'"
```

### Work Items — 更新

```bash
# 更新欄位
adowi update 1234 --title "新標題" --state Active

# 快速關閉
adowi close 1234

# 快速指派
adowi assign 1234 --to "王小明"
```

### Work Items — 留言與刪除

```bash
# 新增留言（預設 markdown；要送 HTML 用 --format html）
adowi comment 1234 --text "已部署到 staging"

# 長文先寫檔再送，避開 shell 引號問題
ado wi comment 1234 --file comment.md

# 附圖：每個 --image 會先上傳，內文的 {{img:<檔名>}} 換成 <img src="..." width="720">
# 帶 --image 時格式預設 html
ado wi comment 1234 --file comment.html --image shot1.png --image shot2.png [--width 720]

# 沒加角括號的 @guid 會被拒送；請用 @<guid> 或 data-vss-mention

# 只印出最終內文與檔案，不打任何網路請求
ado wi comment 1234 --file comment.html --image shot1.png --dry-run

# 列出留言，舊到新（唯讀）
ado wi comments 1234 [--since 2026-11-01T00:00:00Z] [--others-after-me]

# 刪除（移到資源回收筒）
adowi delete 1234

# 永久刪除
adowi delete 1234 --destroy
```

### Repo 資訊與 Commit 關聯

```bash
# 從 git remote URL 取得 repo 資訊（自動解析 org/project/repo）
ado repo info --remote-url "https://dev.azure.com/MyOrg/MyProject/_git/MyRepo"

# 或手動指定
ado repo info --repo-project MyProject --repo-name MyRepo

# 將 commit 關聯到 Task
adowi link-commit \
  --task-id 1234 \
  --project-id <guid> \
  --repo-id <guid> \
  --commit "abc123def456"
```

### 完整工作流範例

```bash
# 1. Commit 並 push
git add -A && git commit -m "fix: 修正逾時問題" && git push

# 2. 取得當前 Sprint
adosprint current
# → { "path": "Project\\Sprint 2026-05", ... }

# 3. 取得 repo 資訊
ado repo info --remote-url "$(git remote get-url origin)"
# → { "projectId": "xxx", "repoId": "yyy", ... }

# 4. 一步開卡
adowi create-card \
  --issue-title "改善：檔案上傳穩定性" \
  --task-title "修正上傳逾時" \
  --task-description "<p>30 秒 timeout 對大檔不足</p>" \
  --iteration "Project\Sprint 2026-05" \
  --project-id xxx --repo-id yyy --commit "$(git rev-parse HEAD)"
```

## 指令總覽

| 指令 | 說明 |
|------|------|
| `ado sprint current` | 取得當前 Sprint |
| `ado sprint list` | 列出 Sprint |
| `ado sprint workitems` | 列出 Sprint 內的工作項目 |
| `ado wi create-issue` | 建立 Issue |
| `ado wi create-task` | 建立 Task |
| `ado wi create-card` | 建立 Issue + Task + commit 關聯 |
| `ado wi get <id>` | 查詢 Work Item |
| `ado wi list` | 列出/篩選 Work Items |
| `ado wi query <wiql>` | 執行 WIQL 查詢 |
| `ado wi children <id>` | 列出子項目 |
| `ado wi update <id>` | 更新 Work Item |
| `ado wi close <id>` | 關閉 Work Item |
| `ado wi assign <id>` | 指派 Work Item |
| `ado wi comment <id>` | 新增留言（預設 markdown，支援 `--image`、`--dry-run`） |
| `ado wi comments <id>` | 列出留言（唯讀） |
| `ado wi delete <id>` | 刪除 Work Item |
| `ado wi link-commit` | 關聯 Commit |
| `ado repo info` | 取得 repo 的 project/repo GUID |

## Claude Code Skills

### `/ado` — Work Item 與 Sprint 操作

安裝的 skill 讓 Claude 能夠：
- 探索組織和專案（`ado projects`）
- 查詢 Sprint 和 Work Items
- 一步完成開卡片（Issue + Task + commit 關聯）
- 自動執行複雜工作流程

### `/ado-pr` — Pull Request 建立

自動化完整的 PR 工作流：
- 分析當前分支與目標分支之間的 commit 差異
- 產生 PR 標題與說明（繁體中文）
- push 前先詢問確認
- 透過 ADO REST API 建立 PR

```
/ado-pr          # 目標 branch 預設為 main
/ado-pr develop  # 目標 branch 為 develop
```

不需要編輯 `CLAUDE.md` — skill 會處理一切。

## 更新紀錄

### 2026-11-09

- `ado wi comments <id>`：列出留言（唯讀，跟著 `continuationToken` 翻頁，支援 `--since`、`--others-after-me`）
- `ado wi comment`：新增 `--image`（可重複）、`--width`、`--dry-run`；沒加角括號的 `@guid` 會被拒送
- `ado wi list`：`@Me`、`@CurrentIteration` 等 WIQL macro 不再被加引號
- `npm test` 改跑 `node:test` 單元測試

### 2026-05-13

- **Skill：新增 `/ado-pr`，支援 Azure DevOps Pull Request 建立**
  - 分析與目標 branch 的 git 差異，自動產生 PR 標題與說明
  - push 前先詢問使用者確認
  - 透過 ADO REST API 建立 PR（無額外相依套件）
  - `install-skill.sh` 現在同時安裝 `/ado` 和 `/ado-pr`

### 2026-04-06

- **Skill：新增 Sprint 卡片規則與 HTML 描述模板**
  - Issue/Task 層級定義與 Title 前綴規則（改善：/新增：/修復：/事件記錄：/評估：）
  - Task 大小原則：一個 Task = 一個可交付成果，不按問題拆
  - Issue / Task / 事件記錄的 HTML Description 模板
  - Comment 注意事項（當時只能用 HTML；現在 `ado wi comment` 預設送 markdown，要 HTML 帶 `--format html`）

## 授權

MIT
