# 全站 Header Actions 完成紀錄

## 實作與覆蓋

首頁原本的 `DesktopContent.topActions` 按鈕及 local `GlobalSearch` 已抽成 `GlobalHeaderActions`、`PageHeaderActions`、`GlobalSearchProvider`。搜尋仍使用 `/api/dashboard/desktop?q=...&kind=...`、220ms debounce、至少兩字、80 字上限與原本類型篩選；沒有新搜尋 API。

所有正式功能共用同一組 Search / Storage icons、主題變數和互動。已套用首頁、網站收藏、一般／成人動漫、筆記、程式碼、照片、檔案、私人日曆、保管庫、單字學習、KTV、所有資料夾、外觀、個人檔案、安全中心、儲存空間及新增資料入口。網站／照片的手機 Overview 與清單 Header 透過原有 `MobilePageHeader` 共用；動漫保留既有 Desktop / Mobile Header 插槽。

不套用登入、註冊、驗證／MFA、Recovery、App Lock 畫面。`/create/[type]` 只是轉址，不新增 Header。`/vocabulary/import` 是 App Shell 之外的伺服器資料集維護頁，沒有全域 Queue Provider，因此不無差別插入。專案沒有獨立的正式 Admin Page Header；儲存空間的管理區保留原本邏輯。

## Queue 與安全

- 舊入口為 `DesktopAppShell` 的 `BackgroundJobIndicator`。已刪除呼叫、presentation export、勾勾／badge CSS、sticky indicator slot 與 Dashboard 隱藏補丁；不再保留其 Desktop 48px / Mobile 44px 狀態列。
- Queue 執行、合併、並行、IndexedDB、rollback、離線與 retry 邏輯未修改。原本 `(app)/layout` 的 `BackgroundSaveProvider` 仍在頁面轉場之外，切換功能不重置工作。
- 新入口保留 Storage icon；pending / offline / failed 顯示 badge，saving / retrying 顯示輕量 spinner。成功僅短暫顯示約 2.5 秒小點，不永久變成勾勾。
- Queue 沿用原本 Desktop 小 panel / Mobile bottom sheet。加入 Escape、focus trap、關閉後 focus restoration，以及手機既有 viewport / scroll-lock helper。
- 全域搜尋只在打開時 mount，關閉／切路由／離開前景會清空結果並取消 request。Ctrl / Cmd K 不可在 App Lock 或其他 Modal 上方再開搜尋。
- 搜尋中若背景失敗自動開啟 Queue，搜尋先關閉，避免兩個全域 Modal 爭奪焦點。
- API、schema、登入、MFA、成人權限與 Folder Lock 沒有修改。原本搜尋在 server 排除 Vault、成人動漫、非標準安全等級、單筆密碼和任何鎖定資料夾關聯；隱私檢查失敗時不曝光資料。這項結論來自程式核對，不代表已操作真實私人資料做 end-to-end 測試。

## 尺寸與版面

Desktop 使用首頁既有 42px、13px radius、9px gap；Mobile 使用首頁 glass treatment、44px 方形 touch target、14px radius、8px gap。新增／管理／頁內搜尋保留，排列在最右兩顆全域操作的左邊。手機含返回鍵與四顆操作的 Header 收斂為 4px layout gap，保留一般標題可读；長標題採合理省略或換行。沒有增加 Header padding、固定高度、sticky Header，也沒有額外加 top safe area。Safe area 繼續由原有 App Shell 處理；Queue sheet 保留原本 bottom safe area。

## 驗證結果與限制

`scripts/tests/global-header-regression.cjs` 使用真實共用 React 元件、Queue Provider 和原有樣式，在隔離 fixture 中測試，只有搜尋 API 使用假的非私人資料。這不是登入正式帳號逐頁的完整 E2E。

- Edge 本機瀏覽器：375 / 390 / 402 / 430 / 700 / 701 / 768 / 820 / 821 / 1024 / 1280 / 1440 / 1920px 全通過。
- 淺色、深色、亮暗漸層背景、長標題、Primary Action 與方形按鈕邊界：通過；無水平溢出。
- 375px 含返回鍵的「全部網站」標題不截短檢查：通過。
- 搜尋 input focus、Tab 邊界、Escape、關閉回原入口、共用 endpoint、頁內搜尋保留：通過。
- Queue pending 一筆／多筆、saving、success 消退、failed、retry、切頁保留、offline 自動恢復：通過。
- Mobile sheet 與 Desktop panel 的畫面邊界、背景失敗與搜尋互斥、App Lock 快捷鍵防護：通過。
- 最後一輪 screenshots 位於本機暫存：`C:/Users/User/AppData/Local/Temp/vault-global-header-hnXIu1`。
- 未實際操作 iPhone / Safari / PWA standalone；手機尺寸測試不等同 iPhone 實機驗收。沒有使用真實照片背景或私人帳戶資料，圖片背景的正式效果仍需部署後實機確認。
- `npx tsc --noEmit`：通過。
- `npm run build`：通過。
- 全專案 lint：仍有 89 errors / 50 warnings。新增元件與新增測試的 scoped lint 無錯誤；已修改既有 TSX 與 HEAD 比較錯誤數未增加，AnimeWorkspace / VocabularyWorkspace 仍各有既有 6 個問題。本輪未擴大修改無關 lint 問題。
- 本轮未 commit、push 或部署。開始前已存在的 `app-lock-provider.tsx` 修改和其他未追蹤工作保留，並非本次修改。

## 修改檔案

新增：

- `src/components/layout/global-header-actions.tsx`
- `src/components/layout/global-header-actions.module.css`
- `src/components/layout/global-search-provider.tsx`
- `src/components/layout/global-search.module.css`
- `src/components/ui/use-dialog-focus.ts`
- `src/app/global-header-layout.css`
- `scripts/tests/global-header-fixture.tsx`
- `scripts/tests/global-header-css-loader.cjs`
- `scripts/tests/global-header-regression.cjs`
- 本紀錄檔。

修改 App 頁面／Layout：

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/(app)/layout.tsx`
- `src/app/(app)/appearance/page.tsx`
- `src/app/(app)/bookmarks/page.tsx`
- `src/app/(app)/code/page.tsx`
- `src/app/(app)/create/page.tsx`
- `src/app/(app)/dashboard/desktop-dashboard.tsx`
- `src/app/(app)/dashboard/desktop-dashboard.module.css`
- `src/app/(app)/dashboard/mobile-dashboard.tsx`
- `src/app/(app)/files/page.tsx`
- `src/app/(app)/ktv/page.tsx`
- `src/app/(app)/notes/page.tsx`
- `src/app/(app)/organize/page.tsx`
- `src/app/(app)/photos/page.tsx`
- `src/app/(app)/profile/page.tsx`
- `src/app/(app)/security/page.tsx`
- `src/app/(app)/vault/page.tsx`

修改共用／功能元件：

- `src/components/layout/desktop-app-shell.tsx`
- `src/components/background-save/background-save-provider.tsx`
- `src/components/background-save/background-save.module.css`
- `src/components/ui/mobile-layout.tsx`
- `src/components/anime/anime-header.tsx`
- `src/components/anime/anime-workspace.tsx`
- `src/components/calendar/calendar-workspace.tsx`
- `src/components/calendar/calendar-mobile.module.css`
- `src/components/vocabulary/vocabulary-workspace.tsx`
- `src/components/system/storage-usage-workspace.tsx`
- `src/components/ktv/ktv.module.css`
- `src/components/security/security-mobile.module.css`
- `src/components/vault/vault-mobile.module.css`
