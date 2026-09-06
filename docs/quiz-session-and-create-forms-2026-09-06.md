# 測驗 session、抽題與新增表單修正

## 流程與原因

1. **繼續失效**：父元件替換題目，子元件卻保留上一輪的題號、答案、結果與 saving state。現在每輪建立 UUID，並以 session ID 作為 React key，建立全新作答狀態。
2. **結果三個按鈕**：回到首頁清除測驗並回複習／測驗模式選擇；重新設定清除結果、帶回上輪條件開啟設定；繼續沿用題數、方向、篩選、計時與抽題模式直接開新一輪。
3. **結果按鈕位置**：普通 document flow，position: static；結果清單不再限制內層高度。只有捲到結果末尾才看到按鈕，沒有 fixed 或 sticky。
4. **保存位置**：沿用 src/lib/pwa/client-resource-cache.ts 的分頁記憶體快取，使用 vocabulary:study-session 與 vocabulary:study-setup。設定、題目、答案、分數所需紀錄、計時、phase 與正在儲存的 Promise 都隨 session 保存，不因 SPA 路由／元件卸載而刪除。沒有寫入 localStorage；整頁重新整理或關閉分頁會清除，登出亦清除。
5. **離開後重開的原因**：原本答案／結果只存在 React 子元件 local state，卸載就消失，重掛時使用舊題目從第 1 題開始。現在重掛會恢復同一 session；儲存途中重掛也只連接同一 Promise，不會重複 POST。
6. **抽題方式**：先篩選語言、搜尋、單字本、熟練度、五十音、未刪除／未暫停，以及是否包含已掌握。依每個單字權重抽取、抽後從候選池移除；題數不超過唯一 ID 數，再 shuffle。JLPT 模式保留 N5 → N1 排序。
7. **實際基礎權重**：

| 既有等級 | 基礎權重 |
| --- | ---: |
| 0 尚未測驗 | 32 |
| 1 完全不熟 | 16 |
| 2 不熟 | 8 |
| 3 普通 | 4 |
| 4 熟悉 | 1.5 |
| 5 已掌握 | 0.12 |

   已測驗的單字乘上 1～1.8 的近期錯誤／遺忘加成：最近 5 次錯誤比例 × 0.35，最後一題答錯加 0.15，距上次作答最多 60 天線性加到 0.3。不是固定類別配額；加成仍保持各等級權重順序。等機率模式不使用這些權重。已掌握可透過既有設定排除，否則機率非零。

8. **中文歧義判斷**：在符合條件的完整候選池，依主要中文意思正規化、分隔符號與順序分組，再比較不同的日文單字；同一日文的重複紀錄不算多個答案。只在中文提示 → 日文回答、且同中文對應多個日文時顯示提示。
9. **首音來源**：依序 reading、kana、pronunciation；片假名轉平假名。沒有可靠讀音時，只有單字本身以假名開頭才可取用；不把漢字第一字當假名。
10. **繼續抽題**：優先從上一輪未出現的候選單字抽取；不足時才補入舊題，維持合法題數且不在同輪重複。重新洗牌；候選全相同時也避免直接重播完全相同順序（JLPT 不跨級打亂）。候選不足原有最低 5 題時保留結果並提示重新設定。
11. **新增儲存按鈕消失原因**：共用 CSS 把表單最後一個 primary button 直接當 sticky footer，覆蓋為淺色背景但保留白色文字，視覺上像消失；長表單的捲動容器亦需明確。現在獨立 CreateFormActions 承擔 footer 背景，按鈕保留 primary／secondary 色彩及原 onSubmit。手機按鈕使用簡潔「取消／儲存」避免換行。
12. **修正表單**：網站收藏、檔案、照片的新增表單；兩個等寬按鈕，44px 最低高度、safe-area 留白、可捲動的主內容區。檔案／照片原有上傳 URL → Storage → 完成 API 流程未改。
13. **名稱統一**：桌機 sidebar、手機導覽定義、首頁捷徑、新增類型頁、網站收藏主標題／操作／管理視窗／空白清單／提示／aria-label、整理頁、外觀清單設定、資料夾 PIN 設定。src 中已無「收藏與整理」。bookmark、bookmarks 等內部識別保留。
14. **修改檔案**：見下方清單。
15. **相容性**：沒有修改 route、API endpoint、API schema、資料庫 schema、加密或儲存格式；不用執行 migration，也不刪除或重置既有學習紀錄。

## 修改檔案

- src/components/vocabulary/vocabulary-workspace.tsx
- src/components/vocabulary/quiz-session.tsx（新增）
- src/lib/vocabulary/quiz-session.ts（新增）
- src/lib/vocabulary/review.ts
- src/components/ui/create-form-actions.tsx（新增）
- src/components/bookmarks/bookmarks-workspace.tsx
- src/components/files/files-workspace.tsx
- src/components/photos/photos-workspace.tsx
- src/app/globals.css
- src/app/(app)/bookmarks/page.tsx
- src/app/(app)/create/page.tsx
- src/app/(app)/dashboard/page.tsx
- src/app/(app)/organize/page.tsx
- src/components/layout/app-sidebar.tsx
- src/lib/layout/mobile-navigation-preferences.ts
- src/components/appearance/appearance-settings.tsx
- src/components/security/folder-lock-settings.tsx
- src/components/anime/anime-workspace.tsx（僅參考頁名稱註解）
- scripts/tests/quiz-browser-regression.cjs
- scripts/tests/quiz-fixture.tsx
- scripts/tests/navigation-stub.tsx
- scripts/tests/storage-stub.ts
- scripts/tests/ts-loader.cjs
- 本文件

## 驗證

- npm run build：通過，含 TypeScript。
- 新增 component / library / test files 的 targeted ESLint：通過。全站 lint 仍有原有錯誤，並非全站 lint 通過。
- 隔離 Edge 瀏覽器載入真實 VocabularyWorkspace 及三種新增元件，以假 API 和假 Storage 測試，不使用使用者資料、不連正式資料庫。
- 完成測驗 → 儲存 → 顯示結果 → 繼續新一輪：通過。
- 儲存中卸載／重掛，維持一個 POST；結果卸載／重掛內容相同：通過。
- 儲存失敗 → 錯誤提示 → 重試 → 結果：通過。
- 回首頁／重新設定、題數編輯、blur 才 clamp、numeric inputMode：通過。
- 結果操作列 1440／390／320px：position static、無溢出；已檢視手機截圖。
- 新增表單 1440／390px：取消／儲存可見，提交確實呼叫既有 API handler；檔案／照片 Storage 為模擬，不代表正式 Storage 端到端上傳已驗證。
- 30,000 次、每級一筆相同歷史的確定性抽題：依等級 0～5 分別為 15,649／7,865／3,851／1,873／691／71，已掌握非零。
- 中文歧義、片假名首音轉換、同字重複不提示、唯一中文不提示、篩選排除、ID 不重複：通過。
- 手機僅為瀏覽器 viewport 模擬；尚未在真實 iPhone／Android 或部署後網站驗收。

執行瀏覽器回歸測試需要 Playwright（可用 NODE_PATH 指向既有 runtime），使用系統 Edge；可用 TEST_BROWSER_CHANNEL 覆寫瀏覽器。
