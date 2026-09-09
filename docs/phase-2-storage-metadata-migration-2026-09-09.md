# Phase 2：統一 Storage Metadata

日期：2026-09-09

## 安全界線

- Migration 由使用者在 Supabase SQL Editor 手動執行；驗證結果為 4 個 true、4 個 0。
- 未刪除帳號、資料庫資料或 Storage object。
- 未搬移、回填或覆寫既有資料。
- `storage_path`、`cover_image_path`、`cover_url` 與 `workspace-storage:` reference 全部保留。
- 任何帳號或帳號資料刪除，必須先取得使用者明確同意。

## Migration

檔名：`20260909090000_add_storage_objects_metadata.sql`

這是 additive migration：

1. 新增 `public.storage_objects`。
2. 新增 nullable `file_details.storage_object_id`。
3. 新增 nullable `entries.cover_storage_object_id`。
4. 新增 nullable `anime_library.cover_storage_object_id`。
5. 建立索引、updated_at trigger、外鍵與 server-only 權限。
6. 不更新任何既有 row，因此執行後 `storage_objects` 預期仍是 0 row。

背景設定目前位於 `user_appearance_settings.preferences` JSON。此 migration 不改 JSON 結構；之後的相容 resolver 會繼續接受既有 `workspace-storage:` reference。

## Rollback（僅在 migration 已執行且尚未開始 dual-write 時使用）

```sql
begin;

drop index if exists public.anime_library_cover_storage_object_id_idx;
drop index if exists public.entries_cover_storage_object_id_idx;
drop index if exists public.file_details_storage_object_id_uidx;

alter table public.anime_library
  drop constraint if exists anime_library_cover_storage_object_id_fkey,
  drop column if exists cover_storage_object_id;

alter table public.entries
  drop constraint if exists entries_cover_storage_object_id_fkey,
  drop column if exists cover_storage_object_id;

alter table public.file_details
  drop constraint if exists file_details_storage_object_id_fkey,
  drop column if exists storage_object_id;

drop table if exists public.storage_objects;

commit;
```

此 rollback 會刪除新 metadata table；若 Phase 2 後續已開始寫入 metadata，必須先停止並取得明確同意，不能直接執行。

## Phase 2 完成

### 本階段做了什麼

- 建立 provider-neutral `storage_objects` metadata schema。
- 建立 server-only `SupabaseStorageMetadataRepository`，支援建立 pending、owner-scoped activation、owner-scoped active lookup 與失敗標記。
- 建立 transitional resolver：有 `storage_object_id` 時優先解析 metadata；沒有、尚未 active 或找不到時繼續讀取舊路徑。
- legacy fallback 強制檢查 `userId/` object-key prefix；repository 的所有讀取與狀態修改都包含 `user_id` 條件。
- 現有功能尚不自動建立 pending metadata。這是刻意的階段邊界：signed upload finalize 與 pending reservation 會依原規劃在 Phase 4／5 才接入。
- 沒有執行帳號、Storage object 或帳號資料刪除。

### 修改檔案

- 本報告檔案。

### 新增檔案

- `supabase/migrations/20260909090000_add_storage_objects_metadata.sql`
- `src/lib/storage/metadata-contract.ts`
- `src/lib/storage/metadata-reference.ts`
- `src/lib/storage/metadata-repository.ts`
- `scripts/storage/metadata-migration.test.mjs`
- `scripts/storage/metadata-reference.test.mjs`
- `scripts/storage/metadata-architecture.test.mjs`
- `scripts/storage/verify-storage-metadata.sql`

### Database / Migration

有。Migration 已由使用者執行，驗證結果符合預期。只新增 schema；舊資料、舊路徑與既有 Storage object 沒有被修改。

### 需要我手動操作

已完成。本階段不再需要手動操作。

### Environment Variables

新增：無。repository 沿用 server-only Supabase admin client，沒有新增或向前端暴露 Secret。

### 測試項目

- Storage 與 metadata：57 / 57 通過。
- migration 專項：4 / 4 通過。
- 帳號隔離與配額：15 / 15 通過。
- Auth OTP：4 / 4 通過。
- Vocabulary 翻譯：12 / 12 通過。
- Vocabulary 例句：2 / 2 通過。
- metadata 新增檔案 ESLint：通過。
- TypeScript：通過。
- Production build：通過，32 個 static pages。
- `git diff --check`：通過。

### 未通過項目

- 未對正式帳號執行新增／刪除 metadata 的破壞性生命週期測試；schema 已由使用者用唯讀驗證確認為空。
- 目前沒有 R2 provider；這是 Phase 3 的範圍。
- pending reservation、上傳 finalize 與 orphan cleanup 尚未啟用；這是 Phase 4／5 的範圍。

### 現有功能 Regression

- Auth：通過既有 OTP regression。
- Database：只增加 nullable 欄位與獨立 metadata 表；既有資料未變。
- Storage：舊 Storage API、bucket、object key 與前端流程未改，57 項測試通過。
- Quota：原 Supabase physical usage gate 未改，15 項 regression 通過。
- Vault：加密與資料流程未改。
- Vocabulary：14 項 regression 通過。

### 下一階段

Phase 3：加入 `B2StorageProvider`，只連線並操作隔離測試物件，不讓正式功能使用。Cloudflare R2 因付款方式要求而停止採用，改用不需信用卡的 Backblaze B2；開始前需先由使用者確認，並依序完成 B2 與 Vercel server-side 環境設定。
