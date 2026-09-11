# 手機 UI 第 1 階段交付報告（2026-09-10）

## 範圍與狀態

已完成本機實作：共用手機設計系統、SVG Icons、底部導覽、手機首頁。
尚未推送／部署；第 2 階段與 Storage Phase 8 均未繼續。
沒有新增 migration，沒有修改、重置或刪除任何帳號與使用者資料。

## Responsive 與 Desktop 保護

- 沿用專案手機分界 `max-width: 700px`；768／820px 保持原本桌機／平板布局。
- 檢查既有 520／700／760／820px 規則；共用手機 CSS 在 globals 後載入，以 scoped selector 覆寫手機規則，不修改 globals.css。
- 520px 只調整手機左右 gutter；340px 以下調整統計小卡內部排列。
- Desktop 原本首頁 DOM、按鈕、六個功能介紹卡保留；手機以單一 MobileDashboard 讀取摘要，桌機不掛載 loader。
- 新增選擇器仍使用原本 ModalDialog，只有手機斷點呈現 Bottom Sheet。未複製表單或提交流程。
- 所有新 CSS 未新增 !important。

## 首頁前後差異

原本：網站介紹式 hero、帳號、六個功能介紹區塊。
現在手機：實際時段問候／帳號 → 六項真實資料概覽 → 快速操作 → Database／Storage 使用量 → 最近新增／更新。
没有可靠開啟紀錄，故使用 updated_at，不稱「最近使用」，未新增 tracking schema。
正式介面沒有使用參考圖的帳號、數量、容量、照片或動漫名称；測試 fixture 的假資料只存在 scripts/tests。

## 共用元件

- AppIcon：本地 inline SVG，使用 currentColor，不依赖外部圖示請求。
- MobilePageHeader、MobileSection：純呈現元件，沒有 query 或 subscription。
- MobileBottomSheet：包裝既有 ModalDialog，沿用 Escape／關閉／鍵盤 viewport 機制，增加焦點循環及返回觸發按鈕。
- 共用 mobile-surface／mobile-chip／mobile-toolbar／mobile-icon-button。
- Feature-specific CSS 放在 dashboard-mobile.module.css。

## 底部導覽與 Safe Area

保留原有 5／7 格自訂功能、選項儲存、導頁及新增事件。
改用 SVG；新增按鈕縮為48px（7格時44px），其餘主要觸控區至少44px。
「更多」與「新增資料選擇器」使用可捲動 Bottom Sheet。
保留既有六種共用新增表單；在動漫／保管庫／日曆頁仍觸發原有新增事件。
使用 safe-area-inset-top／bottom／left／right；visualViewport 變小時收起導覽列，視窗高度跟隨可操作範圍。
動畫180ms，共用 Modal 既有220ms；支援 prefers-reduced-motion。

## 資料請求：有新增，但不逐卡查詢

原本首頁只有介紹，沒有這些統計查詢。本次新增一個唯讀 GET /api/dashboard。
手機初次掛載：1個 HTTP 摘要請求（StrictMode 測試同樣1個）；Desktop：0個。
後端通常4個並行讀取：
1. 自己的 active entries 中繼資料，聚合5種項目數量與最近更新。
2. 自己的一般動漫數量及最近候選；不將成人項目顯示於首頁。
3. 自己的資料夾保護中繼資料。
4. 沿用 vault_user_capacity RPC。

以上不包含身分驗證用 getUser／getClaims。大量 entries／folder_locks 按伺服器實際回傳數量分頁，會有額外讀取，並非永遠固定4次。
沒有每張卡單獨 query、沒有新 realtime subscription、沒有背景掛載的 Desktop loader。
新增資料成功後重載同一份摘要；無持久化摘要快取，避免跨帳號殘留。
超時／失敗停止 loading、顯示重試；容量單獨失敗不阻塞其他摘要。

## 隱私與正確性

- API 只使用伺服器驗證過的 user.id，不接受前端指定其他使用者。
- 檢查 session／claims 與已啟用的 TOTP MFA。
- 讀取皆限制 owner_id／user_id；不使用會清理垃圾桶的 collection loader。
- 數量排除垃圾桶；未知數量顯示「—」而不是假0。
- 最近預覽排除敏感 entries、隱藏及上鎖資料夾，以及成人動漫。
- 資料夾保護查詢失敗時，不輸出項目標題。
- 只回傳摘要，不回傳內文、密碼、封面或附件。
- Cache-Control: private, no-store。

## 驗證結果

### 隔離瀏覽器測試（真實 React 元件與 CSS，模擬 API）

| 寬度 | 結果 |
| --- | --- |
| 320／375／390／430px | 6項統計、44px觸控、5／7格導覽、More／Create、單次請求通過 |
| 1366／1440／1920px | 首頁與新增選擇器改版前後截圖像素一致；新增、Escape、導頁、登出事件通過；摘要0請求 |
| 768／820px | 同上述 Desktop 結果 |

另通過：載入失敗／重試、原本動漫新增事件只觸發一次、Bottom Sheet 焦點恢復、深色／自訂主色／背景圖片、0%與100%透明度、compact密度、120%文字、reduced motion、模擬鍵盤可用高度480px。
0%只影響 surface 背景，文字 opacity 保持1、border仍保留。
人工檢視手機截圖，修正了深色快速操作文字的繼承問題。

### 資料與建置

- mobile-dashboard-data.test.cjs：4組通過（分頁截斷、owner隔離、垃圾桶／成人／隱私排除、保護失敗、容量失敗、MFA）。
- TypeScript noEmit：通過。
- 本次新增功能與測試的 targeted ESLint：通過；未聲稱全站既有 lint 全部通過。
- Next production build：通過。

限制：上述為本機隔離瀏覽器測試，未使用真實帳號修改資料。未做實體 iPhone 主畫面 PWA／iOS 原生鍵盤驗證；safe area 使用標準 env 與既有 Modal 機制，仍建議部署後由實機確認。
未聲稱所有功能頁面均已完成視覺改版或逐頁截圖測試。

## 修改／新增檔案

### Production（14個）

- src/app/layout.tsx
- src/app/mobile-design-system.css
- src/app/(app)/dashboard/page.tsx
- src/app/(app)/dashboard/mobile-dashboard.tsx
- src/app/(app)/dashboard/dashboard-mobile.module.css
- src/app/api/dashboard/route.ts
- src/components/ui/app-icon.tsx
- src/components/ui/mobile-layout.tsx
- src/components/ui/mobile-bottom-sheet.tsx
- src/components/layout/mobile-app-navigation.tsx
- src/components/layout/create-item-provider.tsx
- src/lib/layout/mobile-navigation-preferences.ts
- src/lib/dashboard/data.ts
- src/lib/dashboard/types.ts

### 測試（5個）

- scripts/tests/mobile-stage1-regression.cjs
- scripts/tests/mobile-stage1-fixture.tsx
- scripts/tests/mobile-stage1-stubs.tsx
- scripts/tests/mobile-stage1-css-loader.cjs
- scripts/tests/mobile-dashboard-data.test.cjs

### 本報告

- docs/mobile-stage1-report-2026-09-10.md

測試產物於系統暫存目錄，不作為 production 頁面／route。
Stage 1 完成後停止，等待使用者決定驗收、部署或下一階段。
