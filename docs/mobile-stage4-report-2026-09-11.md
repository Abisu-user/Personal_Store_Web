# 手機 UI 第 4 階段報告（2026-09-11）

## 範圍與狀態

已完成本機實作：私人日曆、照片的手機版介面。
尚未推送或部署；第 5 階段尚未開始，Storage Phase 8 維持暫停。
沒有新增 migration、API、資料查詢、subscription、追蹤欄位或假資料，也沒有修改或刪除使用者資料。

原手機 UI 規劃共 5 階段。包含本次時尚餘 2 階段；本階段完成後，只剩第 5 階段「私密保管庫＋安全中心」。

## 共用資料與事件

- 日曆仍由原本 Server Component 的 `getCalendarWorkspaceData()` 提供 `initialData`，手機與桌機共用同一個 `CalendarWorkspace`。
- 照片仍由原本 Server Component 的 `getPhotosWorkspaceData()` 提供 `initialData`，手機與桌機共用同一個 `PhotosWorkspace`。
- 沒有建立 mobile-only workspace，也沒有讓隱藏元件在背景執行第二次查詢。
- 行程新增／編輯／刪除、月份切換、照片搜尋、上傳、詳情、批量整理、資料夾及類別仍沿用原本 state、事件與 API。
- 照片資料夾與類別繼續共用 `CollectionNavigation`、`ResponsiveChipOverflow` 與第 2 階段的 `mobile-collection.module.css`。

## 日曆手機版

- 頁面改為單欄 App 版面，上半部為月份日曆，下半部為使用者目前選取日期的真實行程。
- 42 格月曆仍使用原本日期與 `eventsByDay` 計算，沒有建立另一份手機資料。
- 月份切換、今天、日期、行程與新增行程仍是原本按鈕；主要控制高度約 44px。
- 月曆格高度縮為 46px，事件以原本顏色 dot 顯示；目前日期與選取日期狀態保留。
- 行程清單改成較清楚的 compact cards，仍點擊原本事件開啟編輯 modal。
- 新增／編輯 modal、色彩、確認刪除及儲存流程沒有修改。

## 照片手機版

- 頁首保留照片標題，原本上傳按鈕縮為 44px 高並使用共用 SVG plus icon。
- 隱藏手機上的重複內層「照片」標題與長介紹，讓內容更早出現。
- 搜尋移到 workspace 最前方，仍是同一個 `query` state 與 input。
- 資料夾、類別、管理、新增及「更多」沿用共用動態寬度計算，不使用固定 slice 或第二排。
- 照片改成 3 欄縮圖 Grid；標題、類別與數量全部使用目前真實資料。
- 新增「全部照片／搜尋結果／垃圾桶＋目前張數」的小型列，數量直接來自當前篩選後的 `photos.length`。
- 卡片仍使用原本按鈕開啟詳情；選取 checkbox 維持 44×44px 觸控區。
- 收藏、置頂、封存、垃圾桶、批量整理與上傳 Storage 流程沒有修改。

## Responsive 與主題

- 主要 breakpoint 沿用 `max-width: 700px`；只有 320px 極窄畫面使用 `max-width: 350px` 微調間距，沒有新增資料或結構分支。
- 新樣式全部位於功能旁的 CSS Module，沒有增加 `globals.css`，沒有使用 `!important`。
- 701px 以上完全不套用本階段版面規則。
- 沿用 `--surface`、`--ink`、`--muted`、`--brand`、`--brand-soft`、`--line` 與既有 workspace 外框透明度。
- 外框使用 background alpha／color-mix，沒有對整個 container 使用 opacity，文字、按鈕及內容不會一起變透明。
- 支援 `prefers-reduced-motion`，手機卡片互動不會在減少動態模式播放 transition。

## 資料請求

修改前與修改後的隔離測試，日曆及照片初次渲染皆為 0 個額外 client API request。
本階段沒有新增 Supabase query、API route 或 Storage request。

## 驗證

測試使用本機假帳號及隔離資料，不連正式 Supabase。API 攔截器拒絕 layout 測試中的所有 API 請求。

| 寬度 | 結果 |
| --- | --- |
| 320／375／390／430px | 日曆及照片無頁面、月曆或 Grid 水平溢出；新增按鈕、搜尋、詳情與 modal 通過 |
| 520／700px | 手機 breakpoint 與既有 cascade 通過 |
| 701／760／768／820px | 日曆、照片修改前後截圖像素一致 |
| 1366／1440／1920px | 日曆、照片修改前後截圖像素一致 |

另驗證：

- 手機照片固定 3 欄且不超出容器。
- 資料夾／類別 rail 單列、子項不超出 rail，隱藏項仍由「更多」處理。
- 日曆顯示選取日期的 3 筆真實測試行程，月份切換與新增 dialog 可操作。
- 照片搜尋、詳情及上傳 dialog 可操作。
- 深色模式、自訂主色、自訂背景、0% surface opacity、compact 密度及 120% 字體，在 320／390／430px 均無水平溢出。
- Targeted ESLint、TypeScript noEmit、git diff check 及 Next.js 16.3.1 production build 全部通過。

最終隔離測試輸出：`C:/Users/User/AppData/Local/Temp/vault-mobile-stage4-o6GQ62`

## 修改檔案

### Production：6 個

1. `src/app/(app)/calendar/page.tsx`
2. `src/app/(app)/photos/page.tsx`
3. `src/components/calendar/calendar-workspace.tsx`
4. `src/components/photos/photos-workspace.tsx`
5. `src/components/calendar/calendar-mobile.module.css`
6. `src/components/photos/photos-mobile.module.css`

### 測試：3 個

1. `scripts/tests/mobile-stage4-data-stubs.ts`
2. `scripts/tests/mobile-stage4-fixture.tsx`
3. `scripts/tests/mobile-stage4-regression.cjs`

### 報告

- `docs/mobile-stage4-report-2026-09-11.md`

第 4 階段完成後停止，等待使用者確認是否推送部署或進入最後的第 5 階段。
