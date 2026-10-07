---
description: 將寶箱遊戲部署到 Vercel（靜態前端，僅訪客模式可用）
argument-hint: "[preview|prod]（預設 preview）"
---

# 部署到 Vercel

目標環境：`$ARGUMENTS`（空白視為 `preview`；`prod` 代表正式環境）。

## 部署前要知道

- 這個專案的登入與計分 API（`server/api.ts`）是掛在 Vite dev / preview server 上的 plugin，**`vite build` 產出的靜態檔不含 API**。部署到 Vercel 後只有訪客模式能玩，登入、註冊、存分數都會失敗。開始前先把這點告訴使用者，確認對方可以接受再往下做。
- 建置輸出目錄是 `build/`，不是 Vite 預設的 `dist/`，Vercel 需要明確設定。
- `vite.config.ts` 會 import `server/api.ts`（用到 `node:sqlite`），所以 Vercel 上的建置也需要 Node >= 22.13；`package.json` 的 `engines` 已經寫了，Vercel 會照著用。

## 步驟

1. **檢查設定（唯讀）**
   - 確認 `package.json` 有 `"build": "vite build"` 與 `engines.node`。
   - 確認 `vite.config.ts` 的 `build.outDir` 仍是 `build`。
   - 查看根目錄有沒有 `vercel.json`。

2. **補上 `vercel.json`（沒有才建立；已存在就只檢查內容，不要覆蓋）**

   ```json
   {
     "$schema": "https://openapi.vercel.sh/vercel.json",
     "framework": "vite",
     "buildCommand": "npm run build",
     "outputDirectory": "build"
   }
   ```

3. **本機先建置一次，確認能成功**：請使用者自己執行 `! npm run build`，再看輸出有沒有錯誤、`build/index.html` 是否產生。建置失敗就停下來先修，不要繼續部署。

4. **部署**（會改變外部狀態，一律交給使用者執行，不要自己跑）：
   - 還沒登入 Vercel：`! npx vercel login`
   - Preview：`! npx vercel`
   - Production（`$ARGUMENTS` 是 `prod` 時）：`! npx vercel --prod`
   - 第一次部署時 CLI 會詢問 scope、專案名稱、是否連結既有專案，照提示回答即可；它會在根目錄產生 `.vercel/`，要確認 `.gitignore` 有排除它，沒有就提醒使用者。

5. **收尾**：從使用者貼回的輸出找出部署網址並回報，同時提醒：
   - 線上版只有訪客模式。
   - 不要自行 `git commit` / `git push`；新增的 `vercel.json` 要不要進版控由使用者決定。
