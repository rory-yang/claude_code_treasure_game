# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

單頁 React 18 + Vite 6 的「寶箱遊戲」（Figma Make 匯出的專案）。三個寶箱中隨機一個藏寶：開到寶 +$100、開到骷髏 -$50；找到寶或三個都開完即結束。此 repo 同時是 Claude Code 教學用範例，`README.md` 列出後續練習步驟（音效、勝負顯示、滑鼠游標、SQLite 登入與計分、Vercel / GitHub Pages 部署指令）。

## 常用指令

```bash
nvm use         # 需要 Node >= 22.13（.nvmrc = 22），因為後端用內建的 node:sqlite
npm install
npm run dev     # Vite dev server，port 3000，會自動開瀏覽器；/api/* 也由它提供
npm run build   # 輸出到 build/（不是 dist/）
```

沒有 lint、測試框架，也沒有 `tsconfig.json`；TypeScript 只由 Vite（SWC）轉譯，不做型別檢查。

## 架構重點

- **所有遊戲邏輯都在 `src/App.tsx`**：`boxes` / `score` / `gameEnded` 三個 state，`initializeGame()` 在 mount 與「Play Again」時重設。計分是在 `setBoxes` 的 updater 內呼叫 `setScore(score ± …)`，讀的是 closure 裡的 `score`（不是 functional update），改動計分邏輯時要注意這個寫法。
- `openBox()` 的副作用（播放音效：寶藏 `chest_open.mp3`、骷髏 `chest_open_with_evil_laugh.mp3`）放在 `setBoxes` **之前**、依目前的 `boxes` 判斷，不要搬進 updater（updater 應為純函式，React 可能重跑它而重複播放；目前 `main.tsx` 沒有包 StrictMode）。
- 遊戲結束時在分數下方顯示 Win / Tie / Loss（依最終分數 >0 / =0 / <0）；未開啟的寶箱 hover 時以 inline style 把游標換成 `assets/key.png`（原因見下方樣式注意事項）。
- **登入與計分後端在 `server/api.ts`**：用 Node 內建 `node:sqlite`（無 npm 依賴），以 Vite plugin（`treasureApiPlugin`）掛在 dev / preview server 上，所以沒有獨立的後端程序；`vite build` 產出的靜態檔**不含 API**（部署到 Vercel / GitHub Pages 時登入不可用，只剩訪客模式）。
  - 資料庫預設在 `data/treasure.db`（已 gitignore），可用環境變數 `TREASURE_DB_PATH` 改路徑（測試時用）。表：`users`、`sessions`（存 token 的 sha256）、`scores`。
  - 端點：`GET /api/me`、`POST /api/signup`、`/api/login`、`/api/logout`、`/api/scores`；session 用 HttpOnly cookie `treasure_sid`。
  - `POST /api/scores` 只接受 100 / 50 / 0：3 箱 1 寶的規則下只可能出現這三種最終分數，改遊戲規則時要同步改 `VALID_FINAL_SCORES`。
  - `node:sqlite` 用 `process.getBuiltinModule` 延遲載入，**不要改回靜態 import**：`server/api.ts` 由 `vite.config.ts` 引入，靜態 import 會讓 Node 20 下整個 dev server 起不來；現在是 dev server 照常啟動，API 回 503 並提示 `nvm use`。
  - `server/api.ts` 可直接用 Node 22 載入測試（type stripping），因此不要在裡面用 enum、parameter properties 等需要轉譯的 TS 語法。
- 前端：`src/api.ts` 是 fetch 包裝；`App.tsx` 的 `player` 為 `null`（顯示 `AuthScreen`）/ `guest`（不打任何 API）/ `user`。`gameEnded` 變 true 時由 effect 呼叫 `saveScore`（僅限登入使用者）。
- 動畫使用 `motion/react`（Framer Motion 的新套件名）。
- `src/components/ui/` 是 shadcn/ui 風格的 Radix 元件，目前只有 `button.tsx`、`input.tsx`、`label.tsx` 被使用；`cn()` 在 `ui/utils.ts`。
- `vite.config.ts` 中大量 `'套件@版本': '套件'` alias 是 Figma 匯出產物（讓帶版本號的 import 可解析）；`@` 指向 `src/`。

## 樣式注意事項（重要）

- `src/index.css` 是**預先編譯好的 Tailwind v4 輸出**（約 4,700 行），專案沒有安裝 tailwindcss 或 PostCSS。因此**只有已經存在於 `index.css` 的 utility class 才會生效**；新增未出現過的 Tailwind class（或任意值如 `cursor-[url(...)]`）不會產生樣式，需改用 inline style 或手動在 CSS 補規則。
- `src/styles/globals.css`（設計 token、`@theme inline`）沒有被任何檔案 import，修改它不會影響畫面。

## 其他

- `src/guidelines/Guidelines.md` 是 Figma Make 的空白範本，沒有實際規範。
- `src/results/` 放的是練習成果截圖（如 `key_hover.png`），程式沒有引用。
- 新增音效/圖片素材的來源請記錄在 `Attributions.md`。
