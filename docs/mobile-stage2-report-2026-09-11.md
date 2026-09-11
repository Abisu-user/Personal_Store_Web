# 手機 UI 第 2 階段報告（2026-09-11）

## 交付範圍

已完成本機實作：動漫收藏、網站收藏的手機呈現，以及兩頁共用的手機 collection 樣式。
尚未推送或部署。第 3 階段未開始，Storage Phase 8 維持暫停。
本階段沒有 migration、API 修改、資料搬移或帳號／資料刪除。

## 手機調整

### 動漫收藏

- 標題右側使用 SVG 搜尋及 44px 新增按鈕。搜尋按鈕直接聚焦既有搜尋輸入框，不建立第二套搜尋狀態。
- 縮小外框、頁首、導覽與區塊間距，保留既有各分頁及權限控制。
- 資料夾／類別標題右側保留管理、新增；chips 沿用 ResponsiveChipOverflow，以實際寬度收進更多。
- 卡片以 2:3 封面、兩欄與一致圓角呈現；一般動漫新增目前觀看集數及總集數／進度條，全部使用原本資料。
- 集數未知顯示「集數未定」，不虛構總集數；成人卡片沿用原有遮罩與權限行為。
- 未新增「繼續觀看」查詢或另一份動漫列表。

### 網站收藏

- 頁首新增按鈕改成 compact SVG 按鈕，手機隱藏原本較長介紹文字。
- 既有搜尋列移到資料夾與類別之前；只使用 CSS order，不重複 DOM、輸入狀態或事件。
- 清單改為緊湊縮圖卡片，保留選取、名稱、摘要與既有標記；置頂項目增加主色邊框辨識。
- 保留使用者的清單／網格／純文字選擇及網格欄數設定，不強制換成唯一清單樣式。
- 沒有加入虛構「最近開啟」或常用次數紀錄，沒有新增 tracking schema。

### 共用與主題

- 新增 mobile-collection.module.css；沒有再往 globals.css 加功能樣式。
- 沿用 --ink、--muted、--surface、--brand、--line、既有外框透明度與陰影。
- 深色模式的未選取分類改用現有 surface／ink，修正白底配淺色文字的對比問題；只在手機覆寫。
- 主要新增／搜尋／管理／chips／導覽分頁觸控區至少 44px；搜尋輸入 16px，避免 iOS 聚焦小字輸入時自動放大。
- 共用手機底部導覽、Safe Area、Modal、鍵盤 viewport 與 reduced-motion 行為沿用第 1 階段，本階段未重寫。

## Responsive 保護

- 手機樣式全部限制在 max-width: 700px。只有手機專用 label／進度條的預設 display:none 在 media 外。
- 新增 class 綁定對應頁面，避免影響其他功能頁。
- 未新增 !important，未修改 globals.css 或原本 desktop 容器、卡片尺寸。
- 保留桌機 DOM 與事件；手機 label 和 progress 的呈現不帶 query 或 subscription。
- 檢查 520／700／760／820px 舊規則，並補测 700／701px 邊界。

## 更多與 overflow 修正

既有共用元件已依 DOM 測量，不是固定顯示幾個。本次未另寫 overflow hook。
320px 測試發現舊 anime-category-scroll 的左右各 1px padding，讓量測外框與實際 rail 相差 2px；手機 scoped 規則移除該 measurement wrapper 的 padding／border。
保留真正外框的內距，測量與可用寬度一致。

驗證：單列不換行、可見 chip 不超過 rail 右緣、More 預留位置、選中隱藏項目時 More active、再次點擊恢復預設、全部放得下時不顯示 More。

## 資料與請求

本階段沒有新增 Supabase query、HTTP endpoint、subscription 或第二套 mobile state。
隔離瀏覽器測試中，初次載入前後均為：

| 頁面 | 修改前 | 修改後 |
| --- | --- | --- |
| 動漫收藏 | 1 次 GET /api/anime/library | 1 次 GET /api/anime/library |
| 網站收藏 | 1 次 GET /api/bookmarks | 1 次 GET /api/bookmarks |

此數量是頁面資料 loader 的請求，不含正式環境 auth、圖片等資源；不宣稱整個網站只會有一個請求。
第 1 階段的首頁摘要 API 是先前修改，並非本階段新增。

## 驗證結果

使用真實 React 元件與 CSS，模擬 API／帳號／封面，不存取或修改正式使用者資料。

| 寬度 | 動漫收藏／網站收藏結果 |
| --- | --- |
| 320／375／390／430px | 通過：無頁面水平溢出、chip 單列、More、44px 主要觸控、搜尋 |
| 520／700px | 手機 breakpoint／cascade 測試通過 |
| 701／760／768／820px | 修改前後截圖像素一致 |
| 1366／1440／1920px | 修改前後截圖像素一致 |

390px 與 1440px 另驗證：資料夾／類別 More、選取／取消選取、管理視窗、資料夾新增視窗、主要新增視窗、Escape 關閉、動漫統計分頁與未授權成人入口隱藏。
每個測試寬度均確認搜尋仍作用於原列表，沒有新增資料請求。

手機 390px、測試固定資料下，第一張卡片的起始位置：

- 動漫：519px → 491px，減少 28px；保留必要操作與 44px 觸控區。
- 網站收藏：586px → 403px，減少約 183px。

主題測試：兩頁深色、自訂主色、背景圖片、0% 外框背景、compact 密度、120% 字體；網站收藏清單／網格／純文字模式均通過無溢出檢查。人工檢視截圖後修正深色 chip 對比。
第 1 階段整套首頁與導覽測試重跑通過，包含 5／7 格導覽、主題透明度、reduced motion 與模擬鍵盤高度。

- Next production build（含 TypeScript）：通過。
- 本次 page 與測試檔 targeted ESLint：通過。未聲稱既有大型 workspace 的全站 lint 全部通過。
- git diff --check：通過；只有 Windows LF／CRLF 提醒。
- 瀏覽器未捕捉到 pageerror。

限制：沒有實體 iPhone PWA、iOS 原生鍵盤或正式資料寫入驗證。桌機像素比對是在相同 Stage 1 共用框架下，比較 Stage 2 前後；不等於正式環境所有資料組合都已驗證。
探索遠端服務、成人內容資料來源、儲存流程均未更動，也未在本次做線上整合測試。

## 檔案清單

### Production：7 個

1. src/app/(app)/anime/page.tsx：掛接 scoped 手機 collection／anime class。
2. src/app/(app)/bookmarks/page.tsx：掛接手機 class，既有新增按鈕加入手機 SVG label。
3. src/components/anime/anime-workspace.tsx：搜尋 focus ref、手機標題操作、一般動漫觀看進度呈現。
4. src/components/bookmarks/bookmarks-workspace.tsx：既有置頂資料加 data-pinned 呈現標記。
5. src/components/ui/mobile-collection.module.css：兩頁共用手機 collection 樣式。
6. src/components/anime/anime-mobile.module.css：動漫手機專有樣式。
7. src/components/bookmarks/bookmarks-mobile.module.css：網站收藏手機專有樣式。

### 測試：3 個

- scripts/tests/mobile-stage2-fixture.tsx
- scripts/tests/mobile-stage2-data.cjs
- scripts/tests/mobile-stage2-regression.cjs

### 文件

- docs/mobile-stage2-report-2026-09-11.md

最終測試截圖／JSON：C:/Users/User/AppData/Local/Temp/vault-mobile-stage2-eV5fpo
第 1 階段重測：C:/Users/User/AppData/Local/Temp/vault-mobile-stage1-42YViO

第 2 階段完成後停止，等待使用者確認後再決定部署或下一階段。
