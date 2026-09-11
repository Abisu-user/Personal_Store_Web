# 手機 UI 第 3 階段報告（2026-09-11）

## 範圍與狀態

已完成本機實作：筆記與想法、程式碼片段的手機版介面。
尚未推送或部署；第 4 階段未開始，Storage Phase 8 維持暫停。
沒有新增 migration、API、資料查詢、subscription 或資料追蹤欄位，也沒有修改／刪除使用者資料。

## 實作方式

兩頁仍使用原本的 Server Component 取得 initialData，手機與桌機共用同一個 NotesWorkspace／CodeWorkspace。
沒有建立 mobile workspace，也沒有讓 display:none 元件在背景查詢。
只增加 CSS Module class、SVG 圖示，以及由既有資料直接呈現的 pinned、updatedAt、language。

所有功能特有樣式位於 mobile-library.module.css，沒有增加 globals.css；資料夾與類別沿用第 2 階段的 mobile-collection.module.css 及既有 ResponsiveChipOverflow。

## 筆記手機版

- 頁首保留「筆記與想法」，新增按鈕縮為 44px 觸控高度並使用現有 SVG。
- 搜尋移到資料夾／類別前方，仍是同一個 query state 與 input。
- 隱藏重複介紹與多餘留白，第一張內容卡更早出現。
- 卡片顯示筆記 SVG、真實類別、摘要、置頂狀態及 updatedAt 日期。
- 置頂卡片以目前主色的淡色 border／surface 辨識，沒有寫死顏色。
- 原本的選取、詳情、編輯、垃圾桶、批量整理、分類與資料夾功能全部保留。

## 程式碼手機版

- 頁首、新增、搜尋、資料夾、類別與批量操作使用同一套 compact layout。
- 手機隱藏原本重複的內層「程式碼片段」標題，不移除 DOM 或桌機標題。
- 無封面卡片以現有 code SVG 和真實 language 欄位辨識語言。
- 卡片顯示真實類別、摘要／程式碼摘要、置頂狀態與 updatedAt 日期。
- 保留程式碼內容 dialog、編輯、刪除／還原、批量整理及原本 SourceEditor。

## Responsive 與主題

- 唯一新 breakpoint：沿用 max-width: 700px。
- 已實測 520／700／701／760／768／820px cascade 邊界。
- 701px 以上不套用手機布局；沒有 !important。
- 主要頁首、新增、chips、管理及選取觸控區至少約 44px。
- 輸入框字體 16px，避免 iPhone Safari 聚焦時自動放大。
- 沿用 --surface、--ink、--muted、--brand、--brand-soft、--line 與原本 workspace 外框透明度。
- updatedAt 固定以 Asia/Taipei 格式化，避免 SSR 與台灣瀏覽器時區不同造成 hydration 文字差異。
- 深色、自訂主色、自訂背景、0% surface opacity、compact 密度、120% 字體均通過。
- 使用者原本的清單／網格／純文字及網格欄數設定仍有效。

## 資料請求

修改前與修改後都由 page 的 getNotesWorkspaceData／getCodeWorkspaceData 提供 initialData。
隔離測試初次渲染前後皆為 0 個額外 client API request。
新增成功後的原本 refresh 行為仍保留；本階段沒有增加請求或改寫儲存流程。

## 驗證

測試使用假帳號及假資料，只在本機隔離瀏覽器執行，拒絕任何 POST／PATCH／DELETE，不連正式 Supabase。

| 寬度 | 結果 |
| --- | --- |
| 320／375／390／430px | 無頁面或列表水平溢出、44px 主要觸控、搜尋、詳情與新增 dialog 通過 |
| 520／700px | 手機 breakpoint 與既有 cascade 通過 |
| 701／760／768／820px | 筆記、程式碼修改前後截圖像素一致 |
| 1366／1440／1920px | 筆記、程式碼修改前後截圖像素一致 |

390px 假資料下第一張內容卡位置：

- 筆記：639px → 411px，提前 228px。
- 程式碼：710px → 411px，提前約 299px。

另驗證：

- 分類隱藏於「更多」後仍維持 active，重按同一分類回到預設。
- 資料夾管理／新增 dialog 可開啟及 Escape 關閉。
- 筆記與程式碼的清單／網格／純文字，在 320／390／430px 深色、120% 字體下均無溢出。
- 瀏覽器無 pageerror。
- Targeted ESLint（page 與本次測試）：通過。
- TypeScript noEmit：通過。
- git diff --check：通過，只有 Windows LF／CRLF 提醒。
- Next production build：通過。

大型 notes-workspace／code-workspace 若單獨執行全檔 ESLint，仍會回報原本已存在的 set-state-in-effect、no-unused-expressions 與 img 警告；本階段沒有修改那些既有段落，也沒有宣稱全站 lint 為零。

限制：尚未使用實體 iPhone PWA／原生鍵盤或正式帳號資料做線上驗證。

## 修改檔案

### Production：5 個

1. src/app/(app)/notes/page.tsx
2. src/app/(app)/code/page.tsx
3. src/components/notes/notes-workspace.tsx
4. src/components/code/code-workspace.tsx
5. src/components/ui/mobile-library.module.css

### 測試：3 個

1. scripts/tests/mobile-stage3-data-stubs.ts
2. scripts/tests/mobile-stage3-fixture.tsx
3. scripts/tests/mobile-stage3-regression.cjs

### 報告

- docs/mobile-stage3-report-2026-09-11.md

最終測試輸出：C:/Users/User/AppData/Local/Temp/vault-mobile-stage3-Op9CFu

第 3 階段完成後停止，等待使用者確認是否推送部署或進入第 4 階段。
