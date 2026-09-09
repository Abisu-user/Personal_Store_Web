# Phase 3：Backblaze B2 連線設定

本階段只新增 B2 provider 與隔離驗證程式。正式功能仍由 Supabase Storage 提供，不搬移、不覆寫，也不刪除任何既有帳號資料。

## 使用的伺服器端環境變數

```dotenv
B2_ENDPOINT=https://s3.<region>.backblazeb2.com
B2_REGION=<region>
B2_ACCESS_KEY_ID=<scoped-key-id>
B2_SECRET_ACCESS_KEY=<application-key>
B2_BUCKET_NAME=<private-bucket-name>
```

- 五個變數都不得使用 `NEXT_PUBLIC_` 前綴。
- Bucket 必須保持 Private。
- Application Key 必須限制在指定 Bucket，使用 Read and Write，並允許 List All Bucket Names 以支援 S3 bucket 驗證。
- 不使用 Master Application Key。
- 不在 Git、文件、聊天或瀏覽器程式碼中保存真實金鑰。

## 隔離界線

- `createB2StorageManager()` 目前沒有被任何正式 route 或頁面引用。
- Supabase 仍是 `src/lib/storage/server.ts` 與 `client.ts` 的預設 provider。
- 即時驗證只允許使用隨機 `test/phase-3/<uuid>/` 路徑。
- 即時驗證會建立兩個很小的純文字測試物件；只有在使用者明確允許後才執行，結束時只清理本次建立的兩個測試物件。
- 不設定 CORS；瀏覽器直傳屬於後續階段。

## 指令

不連線的單元測試：

```powershell
npm run test:storage:b2
```

連線測試（需要使用者明確允許）：

```powershell
npm run test:storage:b2:live
```

正式功能接入 B2 前，還需要用新的 additive migration 將 `storage_objects.provider` 的資料庫限制加入 `b2`。Phase 3 不寫入該表，因此目前不執行資料庫變更。

## 2026-09-09 驗證結果

- 離線 B2 provider 測試：5/5 通過。
- 全套 Storage 測試：67/67 通過。
- TypeScript、ESLint、Next.js production build：通過。
- B2 即時測試：direct PUT、HEAD、GET、signed PUT、signed GET 全部通過。
- 本次隨機 `test/phase-3/<uuid>/` 下的兩個測試物件已清理並驗證不存在。
- 正式 route 與頁面仍未引用 `createB2StorageManager()`，目前線上功能仍使用 Supabase Storage。
