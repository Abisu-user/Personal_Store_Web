# 全站同頁新增視窗（2026-09-07）

## 對應需求

1. 原本跳頁新增：網站收藏、筆記、程式碼、檔案、照片，使用 /create/[type]。手機中央新增與首頁新增也會先切到 /create。
2. 現在上述五項改由 CreateItemProvider 在目前頁面開窗；單字、動漫、保管項目沿用同頁行為並共用新增視窗／操作列。日曆新增與編輯表單亦移入同頁視窗。分類／資料夾等既有同頁 dialog 保留，其新增操作列套用相同的靠右、內容寬度按鈕規則。單字本／標籤的原有小型 inline 新增保留，不涉及跳頁。
3. 一般新增入口皆是 button 開啟 state，不經 router.push/replace，不顯示「正在開啟新增工具」。舊 /create/[type] 網址僅作書籤相容：轉至所屬清單並打開視窗；一般操作不會走這條 redirect。/create 既有選擇頁仍可直接進入，但點選工具也只開 modal。
4. 共用結構為 CreateItemModal，內部重用新增動漫原有 ModalDialog（不是另一套第三方 dialog）。CreateItemProvider 管理全站新增入口，CreateFormActions 共用取消／儲存。
5. Header、可捲動 Content、Footer 分開。操作列透過 React portal 放到 dialog footer，表單 submit button 使用 form attribute 連回原 form，所以仍執行原生 validation 與原 onSubmit。動漫非 form 的儲存按鈕沿用原 save callback。Footer 不是瀏覽器 fixed。
6. Desktop 最大寬 900px，最大高 90dvh／960px；手機 breakpoint 700px，寬度 viewport 減 24px、高度依 visual viewport 與 safe area 留白。中間捲動、header/footer 保留。按鈕約 40px 高、寬度依文字，取消在左、儲存在右且整體靠右。保留網站 theme variables。
7. 成功後關窗，發出 item-created 事件讓原列表重新讀取，不跳頁、不重建背景 workspace。原有搜尋與篩選 state 保留；新資料是否直接可見仍依目前篩選條件。顯示成功通知。失敗保留表單與輸入；如果資料已存但列表更新失敗，另提示重新整理。
8. API endpoint、payload/schema、檔案／照片 ticket + Storage 上傳順序、預覽、分類／資料夾、保管庫 AES-GCM／解鎖流程不變。確實修改的是 submit 成功後的 navigation 分支，改成關窗／通知列表；網站收藏補上網路例外 catch/finally，避免網路失敗時卡住。
9. 修改檔案見下。

## 關閉與草稿

- ×、取消、backdrop、Esc 沿用共用視窗。
- 有欄位輸入時使用既有 ConfirmDialog 詢問是否放棄；選取消繼續保留表單。
- 儲存中停用取消／×，避免中斷資料流程。
- 不永久保存敏感草稿，不修改加密資料格式。

## 驗證

- npm run build 通過（含 TypeScript）。
- 新增共用 component 與測試檔 targeted ESLint 通過；未宣稱全站既有 lint 問題全部清除。
- create-modal-regression.cjs：真實 React 元件、隔離 Edge、假 API／Storage，六種表單 × 1440／768／390px 共 18 組通過。
- 驗證失敗後內容保留、取消會確認、確認取消可繼續編輯、成功關窗與刷新事件、沒有 router.push/replace、URL 不變、footer 按鈕可見且未滿版。
- 已檢視桌面網站收藏與手機筆記截圖。
- quiz-browser-regression.cjs 舊測驗／新增表單測試亦通過。
- 動漫／保管庫／日曆完成 source review 與 build，未以正式帳號實際新增或操作加密資料。
- 手機為 viewport 模擬，未在真實 iPhone／Android 鍵盤或正式部署驗收。
- 不需要 migration，尚未部署；依既有流程由使用者推送。

## 修改檔案

- src/components/layout/create-item-provider.tsx（新增）
- src/components/ui/create-item-modal.tsx（新增）
- src/components/ui/create-form-actions.tsx
- src/components/ui/modal-dialog.tsx
- src/components/layout/mobile-app-navigation.tsx
- src/components/bookmarks/bookmarks-workspace.tsx
- src/components/notes/notes-workspace.tsx
- src/components/code/code-workspace.tsx
- src/components/files/files-workspace.tsx
- src/components/photos/photos-workspace.tsx
- src/components/anime/anime-workspace.tsx
- src/components/vault/vault-workspace.tsx
- src/components/vocabulary/vocabulary-workspace.tsx
- src/components/calendar/calendar-workspace.tsx
- src/app/globals.css
- src/app/(app)/layout.tsx
- src/app/(app)/dashboard/page.tsx
- src/app/(app)/bookmarks/page.tsx
- src/app/(app)/notes/page.tsx
- src/app/(app)/code/page.tsx
- src/app/(app)/files/page.tsx
- src/app/(app)/photos/page.tsx
- src/app/(app)/create/page.tsx
- src/app/(app)/create/[type]/page.tsx
- src/app/(app)/create/[type]/loading.tsx
- scripts/tests/create-modal-fixture.tsx（新增）
- scripts/tests/create-modal-regression.cjs（新增）
- scripts/tests/navigation-stub.tsx
- 本說明文件
