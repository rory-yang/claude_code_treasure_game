---
description: 將寶箱遊戲部署到 GitHub Pages（檢查 gh 登入、建立 repo、設定 Actions 並推送，僅訪客模式可用）
argument-hint: "[repo 名稱]（預設為目前資料夾名稱）"
---

# 部署到 GitHub Pages

目標 repo 名稱：`$ARGUMENTS`（空白時用目前資料夾名稱，例如 `claude_code_treasure_game`）。

部署方式：把原始碼推到使用者自己的 GitHub repo 的 `main`，由 GitHub Actions（`.github/workflows/deploy-pages.yml`）在雲端執行 `npm run build`，再把 `build/` 發布到 `https://<帳號>.github.io/<repo>/`。

## 執行原則（整個流程都要遵守）

- **唯讀檢查**（`gh --version`、`gh auth status`、`gh api user`、`gh repo view`、`git status`、`git remote -v`、`git log`、`ls` 等）可以直接執行。
- **會改變狀態的指令**（安裝 gh、登入、建 repo、改 remote、`git add` / `commit` / `push`、啟用 Pages）一律**列出完整指令、說明作用，請使用者以 `! <指令>` 自己執行**，再讀回輸出判斷下一步。不要自己跑。
- 每個步驟先檢查「是否已完成」，已完成就跳過並告知，讓這個指令可以重複執行。
- 任何一步失敗就停下來說明原因與修正方式，不要跳過往下做。

## 部署前要告知使用者

- 登入與計分 API（`server/api.ts`）是掛在 Vite dev / preview server 上的 plugin，**靜態網站不含 API**。部署後只有訪客模式可玩；登入頁會顯示但登入、註冊會失敗（`/api/*` 在 GitHub Pages 上是 404，前端已有 catch，不會白畫面）。先確認使用者可以接受。
- 免費帳號的 GitHub Pages **只支援 public repo**，原始碼會公開。
- 推送時會把目前工作目錄中要部署的變更 commit 進版控，會先讓使用者確認內容。

## 步驟

### 1. 檢查 GitHub CLI 與登入

1. `gh --version`：找不到指令時，請使用者執行 `! brew install gh`（沒有 Homebrew 則改看 https://cli.github.com 的安裝方式）。
2. `gh auth status`：未登入時，請使用者執行 `! gh auth login`，建議選 `GitHub.com` → `HTTPS` → `Login with a web browser`，並允許 gh 設定 git 認證。
3. 登入後以 `gh api user -q .login` 取得帳號，之後稱為 `<login>`。
4. 確認 token 權限含 `repo` 與 `workflow`（`gh auth status` 會列出 scopes）；缺 `workflow` 會導致推送 `.github/workflows/` 被拒，請使用者執行 `! gh auth refresh -s workflow`。

### 2. 決定目標 repo 與 remote

1. `git remote -v` 查看現有 remote，逐一判斷 owner 是否等於 `<login>`。
2. 情況判斷：
   - **已有指向 `<login>/…` 的 remote**：用 `gh repo view <login>/<repo> --json visibility,defaultBranchRef` 確認存在與是否 public，直接沿用。
   - **只有別人的 remote**（例如這個教學 repo 的 `origin` 指向課程作者 `uopsdod`）：不能推到那裡。用 AskUserQuestion 問使用者 remote 怎麼安排：
     - （建議）把原本的 `origin` 改名為 `upstream`，新 repo 設為 `origin`：`! git remote rename origin upstream`
     - 保留 `origin`，新 repo 另外取名為 `github`
   - **沒有 remote**：新 repo 直接設為 `origin`。
3. 先用 `gh repo view <login>/<repo>` 檢查同名 repo 是否已存在：
   - 已存在：確認它是空的或本來就是這個專案，再請使用者 `! git remote add <remote> https://github.com/<login>/<repo>.git`。不要覆蓋別的專案。
   - 不存在：請使用者執行 `! gh repo create <repo> --public --source=. --remote=<remote>`（只建立 repo 並加 remote，不推送）。

### 3. 準備部署設定（檔案修改，可以直接做，但要告訴使用者改了什麼）

1. **`vite.config.ts` 的 `base`**：GitHub Pages 網址在子路徑 `/<repo>/` 底下，需在 `defineConfig({...})` 內加上 `base: './',`（相對路徑，與 repo 名稱無關；dev server 與 Vercel 部署都不受影響）。已經有 `base` 就只檢查、不重複加。圖片與音效都是 `import` 進來的，會自動套用 base。
2. **`.github/workflows/deploy-pages.yml`**：不存在才建立；已存在就只檢查內容，不要覆蓋。

   ```yaml
   name: Deploy to GitHub Pages

   on:
     push:
       branches: [main]
     workflow_dispatch:

   permissions:
     contents: read
     pages: write
     id-token: write

   concurrency:
     group: pages
     cancel-in-progress: false

   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v5
         - uses: actions/setup-node@v5
           with:
             node-version-file: .nvmrc   # 22；vite.config.ts 會 import 用到 node:sqlite 的 server/api.ts
             cache: npm
         - run: npm ci
         - run: npm run build
         - uses: actions/configure-pages@v5
         - uses: actions/upload-pages-artifact@v4
           with:
             path: build                 # 本專案輸出在 build/，不是 dist/

     deploy:
       needs: build
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - id: deployment
           uses: actions/deploy-pages@v4
   ```

3. 確認 `.nvmrc`、`package-lock.json` 存在且會被 commit（`npm ci` 需要 lockfile）。
4. 請使用者在本機先建置一次：`! npm run build`，確認沒有錯誤、`build/index.html` 中的資源路徑是 `./assets/...`。失敗就先修，不要繼續。

### 4. Commit 並推送

1. `git status` 列出變更，逐一說明哪些會進這次 commit。檢查不能有 `data/`、`.env*`、`build/`、`.vercel/`（已在 `.gitignore`），也看一下有沒有密碼、token 之類的內容。
2. 用 AskUserQuestion 讓使用者確認要 commit 的範圍與 commit message，再請使用者執行，例如：
   `! git add -A && git commit -m "Deploy to GitHub Pages"`
   （commit message 結尾加上 `Co-Authored-By` 行，依當下 session 的 attribution 指示）
3. 推送到新 repo 的 `main`（Pages 的 `github-pages` environment 預設只允許 default branch 部署，所以一律推成 `main`）：
   `! git push -u <remote> HEAD:main`
   若目前分支不是 `main`（例如 `initial`），要先說明：這會把目前分支的內容推成遠端的 `main`。

### 5. 啟用 GitHub Pages（來源設為 GitHub Actions）

1. 查詢：`gh api repos/<login>/<repo>/pages`。
   - 404：請使用者執行 `! gh api -X POST repos/<login>/<repo>/pages -f build_type=workflow`
   - 已存在但 `build_type` 不是 `workflow`：`! gh api -X PUT repos/<login>/<repo>/pages -f build_type=workflow`
2. 如果第 4 步推送時 Pages 還沒啟用，第一次 workflow 會失敗；啟用後請使用者重跑：`! gh workflow run deploy-pages.yml --repo <login>/<repo>`。

### 6. 確認部署結果

1. `gh run list --repo <login>/<repo> --workflow deploy-pages.yml --limit 3` 查看狀態；執行中可請使用者 `! gh run watch --repo <login>/<repo>` 追蹤。
2. 失敗時用 `gh run view <run-id> --repo <login>/<repo> --log-failed` 讀錯誤並說明修法。常見原因：
   - `npm ci` 失敗：lockfile 未 commit 或與 `package.json` 不一致。
   - 建置時 `node:sqlite` 相關錯誤：Node 版本不對，檢查 `.nvmrc` 與 workflow 的 `node-version-file`。
   - deploy 步驟被 environment 規則擋下：推送的分支不是 default branch。
3. 成功後用 `gh api repos/<login>/<repo>/pages -q .html_url` 取得網址。

### 7. 收尾回報

- 原始碼：`https://github.com/<login>/<repo>`
- 網站：`https://<login>.github.io/<repo>/`（第一次部署後可能需要 1–2 分鐘才生效）
- 提醒：線上版只有訪客模式；之後只要推送到 `main` 就會自動重新部署。
