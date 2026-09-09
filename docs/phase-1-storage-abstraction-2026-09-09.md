# Phase 1：Storage 抽象層
日期：2026-09-09

## Phase 1 完成

程式重構、本機自動測試與真實 Supabase Storage 驗收均已完成。
未開始 Phase 2，未部署、推送、執行 migration、搬移或刪除正式資料。

### 本階段做了什麼

- 加入 StorageProvider、SupabaseStorageProvider、StorageManager，預設且唯一啟用的 provider 仍是 Supabase。
- Feature → StorageManager → SupabaseStorageProvider。瀏覽器仍然先向原 API 取得上傳憑證，再直傳 Supabase；沒有增加檔案中轉 API、重試或額外 Storage request。
- server.ts 是 server-only 組裝入口，沿用 createAdminClient；client.ts 使用原 publishable client，只向功能程式提供 signed upload 介面。
- 統一 upload、uploadToSignedUrl、createSignedUploadUrl、getSignedUrl、download、delete、head、list、listBuckets。
- head 是 provider 的 metadata-only 操作，Supabase 用既有 SDK info()；不下載內容，資料缺失時回傳 null，不假裝容量是 0。現有 finalize 仍使用原本 list 確認方式，沒有擅自改流程。
- 各 API 的 session、owner_id / user_id、成人權限、quota、HMAC ticket、錯誤回應與資料庫寫入顺序不變。
- 帳號刪除原有遞迴清理移到 cleanup.ts：每頁 100、每批刪除 100、最多 12 層；收完該 bucket 所有頁才刪除，失敗中止，成功後才繼續刪除驗證紀錄與 Auth。
- 權限檢查仍由既有 server routes 負責。StorageManager 不是新的公開 API，也不能取代 ownership / quota gate。
- 不新增 provider 選項／環境旗標，避免在只有一個 provider 時誤啟用未實作服務。未來 provider 切換由共用組裝入口處理，不交給各頁面判斷。

既有位置維持：

| 功能 | Bucket | Object key |
| --- | --- | --- |
| 一般檔案 | vault-files | userId/uuid |
| 照片 | vault-files | userId/photos/uuid |
| 動漫／收藏／筆記／程式碼封面 | content-covers | userId/covers/uuid |
| 桌面背景 | workspace-backgrounds | userId/desktop/uuid.ext |
| 手機背景 | workspace-backgrounds | userId/mobile/uuid.ext |

工作背景 reference 仍是 workspace-storage: 加原路徑；資料欄位 storage_path、cover_image_path、cover_url 均不變。
檔案下載簽名有效期仍為 60 秒；背景網址仍為 86400 秒；封面／照片仍由原 API 回傳 private, no-store 二進位內容。

### 修改檔案

共 17 個既有檔案。除了測試入口／刪除 helper 移位，其餘僅替換 Storage 呼叫和 import，無 UI layout 改動。

- [package.json](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/package.json>)
- [scripts/system/account-isolation-quota.test.mjs](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/scripts/system/account-isolation-quota.test.mjs>)
- [src/app/api/anime/library/[id]/cover/route.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/app/api/anime/library/[id]/cover/route.ts>)
- [src/app/api/appearance/backgrounds/route.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/app/api/appearance/backgrounds/route.ts>)
- [src/app/api/appearance/route.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/app/api/appearance/route.ts>)
- [src/app/api/content-covers/route.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/app/api/content-covers/route.ts>)
- [src/app/api/content-covers/upload-url/route.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/app/api/content-covers/upload-url/route.ts>)
- [src/app/api/files/route.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/app/api/files/route.ts>)
- [src/app/api/files/upload-url/route.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/app/api/files/upload-url/route.ts>)
- [src/app/api/photos/route.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/app/api/photos/route.ts>)
- [src/app/api/photos/upload-url/route.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/app/api/photos/upload-url/route.ts>)
- [src/components/content/cover-image-field.tsx](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/components/content/cover-image-field.tsx>)
- [src/components/files/files-workspace.tsx](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/components/files/files-workspace.tsx>)
- [src/components/photos/photos-workspace.tsx](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/components/photos/photos-workspace.tsx>)
- [src/lib/appearance/preferences.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/lib/appearance/preferences.ts>)
- [src/lib/content/server.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/lib/content/server.ts>)
- [src/lib/security/account-deletion.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/lib/security/account-deletion.ts>)

### 新增檔案

- [src/lib/storage/provider.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/lib/storage/provider.ts>)
- [src/lib/storage/supabase-provider.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/lib/storage/supabase-provider.ts>)
- [src/lib/storage/manager.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/lib/storage/manager.ts>)
- [src/lib/storage/server.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/lib/storage/server.ts>)
- [src/lib/storage/client.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/lib/storage/client.ts>)
- [src/lib/storage/cleanup.ts](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/src/lib/storage/cleanup.ts>)
- [scripts/storage/harness.mjs](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/scripts/storage/harness.mjs>)
- [scripts/storage/provider.test.mjs](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/scripts/storage/provider.test.mjs>)
- [scripts/storage/routes.test.mjs](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/scripts/storage/routes.test.mjs>)
- [scripts/storage/architecture.test.mjs](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/scripts/storage/architecture.test.mjs>)
- [scripts/storage/live-validation.mjs](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/scripts/storage/live-validation.mjs>)
- [docs/phase-1-storage-abstraction-2026-09-09.md](<C:/Users/User/Documents/Codex/2026-08-14/sites-plugin-sites-openai-bundled-2/vault-app/docs/phase-1-storage-abstraction-2026-09-09.md>)

### Database / Migration

無。沒有新增 table、欄位、bucket、索引、policy 或資料更新；不需要 SQL、不需要資料搬移或備份作業。
Auth、Vault 加密程式、quota 實作與既有 migration 已用 git diff 確認未更動。

### 需要我手動操作

本階段不再需要手動設定。原本 `.env.local` 有兩行同名 `SUPABASE_SECRET_KEY`，後面的非金鑰值覆蓋了正確 Secret；移除重複行後，正常環境載入、唯讀連線及 live validation 均通過。

Vercel 尚未修改；本次重構沒有要求外部新服務設定，無需建立 R2／Neon。
目前沒有自動提交或部署；僅 push 不會包含尚未 commit 的改動。

### Environment Variables

新增：無。
沿用 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`；Secret 仍受 server-only 邊界保護。
本機設定已確認有效。Vercel 沒有修改，不需要因環境變數重新部署；程式改動要上線仍需另行部署。
沒有新增依賴，package-lock.json 未更動。

### 測試項目

自動測試使用隔離的假外部回應來覆蓋成功與失敗分支；另有真實 Supabase live validation 驗證 provider 的實際物件生命週期。

| 檢查 | 結果 |
| --- | --- |
| npm run test:storage | 46 / 46 通過 |
| npm run test:account-isolation | 15 / 15 通過 |
| npm run test:auth:otp | 4 / 4 通過 |
| 日文翻譯 regression | 12 / 12 通過 |
| 系統例句 regression | 2 / 2 通過 |
| npx tsc --noEmit | 通過 |
| npm run build | 通過，32 個 static pages 產生成功 |
| 新增 Storage 層與測試 ESLint | 通過 |
| git diff --check | 通過 |
| 正常 `.env.local` 唯讀連線 | 通過，取得 3 個既有 bucket |
| npm run test:storage:live | 通過，5 / 5 物件生命週期與清理完成 |

Storage 測試涵蓋：

- 動漫、收藏、筆記、程式碼共用封面上傳 helper。
- 工作區桌面／手機背景上傳、既有 reference、裝置與帳號隔離條件。
- 照片、一般檔案上傳憑證、原 bucket/key/token、MIME、二進位 byte-for-byte 不变。
- SDK upload、signed upload、download、head、delete、list 與錯誤回傳。
- 特殊字元下載檔名、60 秒下載與 86400 秒背景簽名。
- 真實檔案／照片 API finalize 驗證 HMAC、檔案存在、原路徑落庫。
- 未登入／配額已滿不得發出上傳憑證。
- 私密照片／封面讀取的 owner 條件、成人內容權限 gate。
- 刪檔失敗不繼續刪 DB。
- 帳號清理超過 200 個物件、巢狀資料夾、額外 bucket、每批 100、不同 user prefix 不互相誤刪、失敗中止與重試。
- 全 src AST 掃描確認只剩 adapter 直接執行 Supabase Storage SDK 操作。
- client 路徑無 admin／server secret import。
- live validation 使用一般檔案、照片、封面、桌面背景、手機背景的原 bucket/key/MIME，逐項通過簽名上傳、HEAD、直接下載、60 秒簽名下載及 byte-for-byte 比對。
- 5 個 live validation 物件已逐一刪除，且刪後 HEAD 確認不存在。
- 額外執行最近測試物件殘留稽核，未找到未標記的驗證檔案（0 筆）。

### 未通過項目

1. **正式帳號刪除實測**：未執行，以免刪除現有帳號資料；目前為真實程式 + fake transport 的分頁、批次、隔離、失敗中止與可重試測試。
2. **quota-full 真實破壞性測試**：未刻意填滿正式帳號；配額 gate、Storage trigger 與拒絕核發 upload token 由既有 migration 檢查及隔離測試覆蓋。正常 live upload 已證明實際 trigger 可通過合法上傳。
3. **私密保管庫附件**：目前專案沒有此上傳／下載功能。已有的是瀏覽器 AES-GCM 加密文字 → vault_payloads；本階段沒有新增、修改或搬移保管庫附件，也不把一般檔案測試冒充此項通過。
4. **既有 UI lint**：本次涉及的舊 UI 檔案原本有 3 errors / 8 warnings。使用 HEAD 與現在內容分別 lint，比對診斷完全一致，本次未新增：
   - cover-image-field.tsx：1 error / 2 warnings。
   - files-workspace.tsx：1 error / 2 warnings。
   - photos-workspace.tsx：1 error / 4 warnings。
   主要是既有 setState-in-effect、img 與 hooks 提醒；不在本 Storage 重構範圍內。

### 現有功能 Regression

- Auth：OTP 測試通過、Auth clients 未改；未做真人帳號登入 E2E。
- Database：既有資料結構、欄位、查詢、migration 不變；finalize handler mock integration 通過。
- Storage：46 項相容性與安全邊界測試通過；5 類真實 Supabase 物件生命週期與清理通過。
- Quota：原 preflight RPC 與 storage.objects trigger 不變；15 項原有 regression 及新增 quota gate 測試通過。
- Vault：加密／解密與儲存流程未改，附件功能目前不適用。
- Vocabulary：翻譯與例句共 14 項 regression 通過。
- UI：未改 layout / CSS，正式編譯通過；未宣稱已完成 desktop/mobile 真機驗收。

### 回復方式

本階段沒有改資料、路徑或 schema，日後回到原版本程式即可讀原資料，不需反向 migration。
目前沒有自動 commit，因此不要使用 git reset --hard 或覆蓋整個 worktree；如需撤回，應只撤回本報告列出的 Phase 1 改動，保留使用者與 Phase 0 檔案。

### 下一階段

Phase 1 已完成，等待明確確認。
下一階段才是 Phase 2：統一 Storage Metadata。需要 SQL 時會先提供完整 migration 與執行說明，不會自行修改正式 Database。
本次停止，不啟用 R2／Neon、不開始下一階段。
