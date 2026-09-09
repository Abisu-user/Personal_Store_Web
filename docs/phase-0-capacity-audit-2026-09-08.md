# Phase 0：Supabase 容量現況分析

## 範圍與結論

唯讀盤點 Personal_Store_Web 的 main / Production，2026-09-08 11:32–11:40（Asia/Taipei）。最後一次一致快照在 11:40:01，與前次 56 張表的數據完全相同。沒有變更應用程式、API、schema、配額或 provider，沒有搬移或刪除物件。

- Database：115,494,035 bytes = 110.14 MiB。
- Storage：15,094,114 bytes = 14.39 MiB，共 442 個物件。
- 依專案程式的預設容量 500 MiB Database / 1 GiB Storage 比較，分別約 22.03% / 1.41%。此比例不是另行確認過的供應商計費報表或 Vercel Production 環境變數。
- 現在沒有必要增加第二個 Database。容量不足時，優先評估系統字典／單字／共用例句，不移動 Auth、權限、個人學習進度或 Vault。
- 若繼續擴充架構，仍建議先做 Storage 抽象層，再按核准階段試行 R2；目前並無緊急搬檔需求。

## 計量定義

所有表格大小單位為 MiB（1 MiB = 1,048,576 bytes）。

- 筆數：實際 `count(*)`，不是 PostgreSQL 估計列數；包含垃圾桶／封存資料。
- 邏輯大小：`sum(pg_column_size(row))`，沿用個人配額的 row-size 估算口徑；不是未壓縮原文或網路傳輸大小。
- Table：`pg_table_size`，包含 TOAST 等資料表儲存與輔助空間，不包含主表 indexes。
- Index：`pg_indexes_size`。
- Total：`pg_total_relation_size`，包含資料表、索引及相關儲存空間。
- Database：`pg_database_size(current_database())`；與 public tables 的總和不同，還包含 Auth、Storage metadata、系統 catalogs 等。
- Storage：`storage.objects.metadata.size` 加總；442 個物件皆有可解析的 size。未下載物件內容或對每個物件做實體 HEAD。
- 本次各查詢為短時間分別取得的唯讀快照，並非跨所有查詢的單一長交易；適合作容量基準，不能據此推算成長速度。

## Database 排行榜

依實體 Total 降冪，共 56 張 public tables。

| Table | 筆數 | 邏輯 MiB | Table MiB | Index MiB | Total MiB |
|---|---:|---:|---:|---:|---:|
| dictionary_entries | 19,488 | 29.4000 | 33.6250 | 4.2109 | 37.8359 |
| system_vocabulary | 19,559 | 18.1553 | 21.1094 | 7.2813 | 28.3906 |
| vocabulary_examples | 36,877 | 10.7441 | 11.1484 | 8.6016 | 19.7500 |
| vocabulary_collection_entries | 19,488 | 2.1957 | 2.9922 | 3.8047 | 6.7969 |
| anime_library | 179 | 0.2502 | 0.3750 | 0.1250 | 0.5000 |
| vocabulary_cards | 183 | 0.1397 | 0.2422 | 0.1797 | 0.4219 |
| anime_library_tags | 547 | 0.0334 | 0.0703 | 0.1094 | 0.1797 |
| vocabulary_review_logs | 278 | 0.0310 | 0.0703 | 0.1094 | 0.1797 |
| note_versions | 35 | 0.0506 | 0.1250 | 0.0469 | 0.1719 |
| entries | 28 | 0.0047 | 0.0469 | 0.1094 | 0.1563 |
| vocabulary_meanings | 201 | 0.0326 | 0.1016 | 0.0313 | 0.1328 |
| note_details | 8 | 0.0255 | 0.1094 | 0.0156 | 0.1250 |
| anime_tags | 33 | 0.0033 | 0.0156 | 0.0938 | 0.1094 |
| audit_logs | 203 | 0.0283 | 0.0703 | 0.0313 | 0.1016 |
| categories | 10 | 0.0010 | 0.0156 | 0.0781 | 0.0938 |
| dictionary_translations | 34 | 0.0039 | 0.0469 | 0.0469 | 0.0938 |
| vocabulary_lookup_cache | 11 | 0.0116 | 0.0469 | 0.0469 | 0.0938 |
| anime_folders | 10 | 0.0011 | 0.0156 | 0.0469 | 0.0625 |
| app_locks | 2 | 0.0003 | 0.0469 | 0.0156 | 0.0625 |
| auth_otp_send_events | 3 | 0.0006 | 0.0156 | 0.0469 | 0.0625 |
| auth_verification_flows | 1 | 0.0001 | 0.0156 | 0.0469 | 0.0625 |
| bookmark_folders | 1 | 0.0001 | 0.0156 | 0.0469 | 0.0625 |
| content_folders | 3 | 0.0003 | 0.0156 | 0.0469 | 0.0625 |
| folder_locks | 1 | 0.0002 | 0.0156 | 0.0469 | 0.0625 |
| folder_unlock_sessions | 1 | 0.0002 | 0.0156 | 0.0469 | 0.0625 |
| vocabulary_search_history | 9 | 0.0007 | 0.0156 | 0.0469 | 0.0625 |
| quota_change_logs | 2 | 0.0002 | 0.0078 | 0.0469 | 0.0547 |
| calendar_events | 0 | 0.0000 | 0.0156 | 0.0313 | 0.0469 |
| device_sessions | 21 | 0.0055 | 0.0156 | 0.0313 | 0.0469 |
| dictionary_sources | 3 | 0.0010 | 0.0156 | 0.0313 | 0.0469 |
| file_details | 4 | 0.0008 | 0.0156 | 0.0313 | 0.0469 |
| profiles | 2 | 0.0001 | 0.0156 | 0.0313 | 0.0469 |
| tags | 2 | 0.0002 | 0.0156 | 0.0313 | 0.0469 |
| vocabulary_collections | 2 | 0.0003 | 0.0156 | 0.0313 | 0.0469 |
| vocabulary_dataset_imports | 8 | 0.0038 | 0.0156 | 0.0313 | 0.0469 |
| adult_content_permissions | 1 | 0.0001 | 0.0078 | 0.0313 | 0.0391 |
| anime_library_folders | 52 | 0.0032 | 0.0078 | 0.0313 | 0.0391 |
| entry_tags | 0 | 0.0000 | 0.0078 | 0.0313 | 0.0391 |
| anime_preferences | 1 | 0.0001 | 0.0156 | 0.0156 | 0.0313 |
| anime_watch_logs | 0 | 0.0000 | 0.0078 | 0.0234 | 0.0313 |
| bookmark_details | 6 | 0.0018 | 0.0156 | 0.0156 | 0.0313 |
| code_details | 1 | 0.0001 | 0.0156 | 0.0156 | 0.0313 |
| password_reset_authorizations | 0 | 0.0000 | 0.0078 | 0.0234 | 0.0313 |
| user_settings | 2 | 0.0002 | 0.0156 | 0.0156 | 0.0313 |
| vault_payloads | 9 | 0.0023 | 0.0156 | 0.0156 | 0.0313 |
| vaults | 1 | 0.0002 | 0.0156 | 0.0156 | 0.0313 |
| vocabulary_ai_cache | 0 | 0.0000 | 0.0078 | 0.0234 | 0.0313 |
| quota_system_settings | 1 | 0.0001 | 0.0078 | 0.0156 | 0.0234 |
| user_storage_quotas | 2 | 0.0002 | 0.0078 | 0.0156 | 0.0234 |
| vocabulary_catalog_admins | 1 | 0.0000 | 0.0078 | 0.0156 | 0.0234 |
| vocabulary_decks | 0 | 0.0000 | 0.0078 | 0.0156 | 0.0234 |
| vocabulary_tags | 0 | 0.0000 | 0.0078 | 0.0156 | 0.0234 |
| user_appearance_settings | 0 | 0.0000 | 0.0078 | 0.0078 | 0.0156 |
| vocabulary_settings | 0 | 0.0000 | 0.0078 | 0.0078 | 0.0156 |
| vocabulary_card_tags | 0 | 0.0000 | 0.0000 | 0.0078 | 0.0078 |
| vocabulary_deck_cards | 0 | 0.0000 | 0.0000 | 0.0078 | 0.0078 |

public 合計（bytes）：邏輯 64,104,095；Table 74,145,792；Index 27,238,400；Total 101,384,192。Table + Index = Total。

前四張表 Total 合計 97,280,000 bytes（92.77 MiB），占 public 實體容量 95.95%。不代表搬移後可以立即釋放完全相等的供應商容量；資料重複、索引、舊表保留與空間回收方式都會影響結果。

## User Data 與 System Data

System Shared Data：`dictionary_entries`、`system_vocabulary`、`vocabulary_collection_entries`、`dictionary_translations`、`dictionary_sources`、`vocabulary_collections`、`vocabulary_dataset_imports`、`vocabulary_lookup_cache`，以及 `vocabulary_examples.card_id IS NULL` 的共用例句。

這些共用內容邏輯大小合計 63,452,138 bytes（約 60.51 MiB）。

User Data：`anime_library` 及觀看／分類關聯、`entries` 及各功能 details、`note_versions`、個人單字卡／意思／例句／複習紀錄、資料夾、標籤、日曆、Vault 密文、帳號設定與安全紀錄等。以正式環境 `vault_user_capacity` 彙總兩個帳號，個人 Database 用量合計 650,711 bytes（約 0.62 MiB）。

平台管理與帳號服務 metadata（例如 quota settings、OTP flows、配額紀錄）另列為系統／帳號基礎資料，不把 provider 物理開銷硬分配給使用者。

### 混合例句表

| 所有權 | 筆數 | 邏輯 bytes |
|---|---:|---:|
| 系統共用（card_id null） | 36,855 | 11,262,864 |
| 個人（card_id 指向個人單字） | 22 | 3,120 |

正式環境的個人配額 function 已排除共用字典表，例句只透過個人 `vocabulary_cards` 關聯計入。共用例句沒有算到個人 25 MiB 預設 quota。個人例句失聯父卡數為 0。

注意：現有管理員「系統／個人」實體容量分類以 table 名稱判斷，會把整張 `vocabulary_examples` 與 `vocabulary_lookup_cache` 歸為 personal。此為管理員分類口徑問題，和個人 quota 是否誤扣是兩件事。本階段未修改該邏輯；未來 UsageManager 應拆分 mixed table 的邏輯用量，實體索引仍屬共用開銷。

## Storage 排行榜

| Bucket | Category | 物件數 | Used bytes | MiB |
|---|---|---:|---:|---:|
| content-covers | 封面 | 438 | 12,891,068 | 12.2939 |
| vault-files | photos | 2 | 1,944,919 | 1.8548 |
| vault-files | files / attachments | 2 | 258,127 | 0.2462 |
| workspace-backgrounds | desktop / mobile | 0 | 0 | 0 |
| 合計 | | 442 | 15,094,114 | 14.3949 |

目前只有這三個 buckets，全部 private。photos/attachments 是功能分類，不是額外 buckets。一般檔案與附件目前沒有可靠的獨立識別欄位，因此列為同組。兩個使用者的 Storage 合計與 bucket 物件總量、正式 `vault_project_storage_usage()` 一致；RPC errors 為空。

### 疑似未引用封面

比對 `entries.cover_image_path` 與 `anime_library.cover_url`（包含垃圾桶資料）：

- 找到直接引用：4 個，396,424 bytes。
- 未找到直接引用：434 個，12,494,644 bytes（約 11.92 MiB）。

未引用物件不能直接認定可刪除，仍需核對進行中的上傳、歷史流程與其他引用形式；本階段沒有刪除任何檔案。後續若要搬封面，先核對這批物件，避免把歷史殘留一併搬走。

## Schema 實體容量補充（bytes）

| Schema | Relation total bytes |
|---|---:|
| public | 101,384,192 |
| pg_catalog | 11,796,480 |
| auth | 1,572,864 |
| storage | 942,080 |
| information_schema | 253,952 |
| realtime | 57,344 |
| vault | 24,576 |

此處 `storage` 是 Database 內的物件 metadata，不是 15,094,114 bytes 的 Storage 檔案內容；也不是可以移到 R2 就全部消失的容量。Schema relation totals 不需與 `pg_database_size` 完全相等。

## 檢查結果與限制

- 56 張資料表的精確筆數、row-size、table/index/total 查詢：通過。
- 每表 Table + Index = Total、全部 public totals 相符：通過。
- 系統／個人例句筆數與邏輯大小加總：通過。
- 個人 quota 排除系統共用內容：正式 function 定義與實際容量結果皆已核對。
- Storage 物件分類、user usage、project RPC 總額：一致。
- 缺少 Storage size metadata：0 個。
- 可重用唯讀 SQL 的 `all_tables_measured`、`physical_parts_match`、`no_missing_storage_sizes`、`personal_storage_matches_project`：全部為 true。最後一次查詢使用 REPEATABLE READ / READ ONLY，該次 row counts 與 logical/storage 統計來自同一交易快照；physical size functions 仍是觀測當下的實體大小。
- 本機直接 API 查詢：收到 Invalid API key；沒有變更或擷取新金鑰，改用已登入 Supabase SQL Editor 執行唯讀盤點。這不代表 Production 網站使用同一組失效設定。
- 未執行 Auth 登入／註冊、Storage 上傳刪除、配額寫入或其他功能端到端測試；本階段沒有更動這些程式，不能把它們宣稱為已通過 Regression。
- 無 migration、無新增 environment variables、無需部署。

## 新增檔案與重跑方式

只新增本報告及 `scripts/system/audit-capacity-readonly.sql`。既有檔案未修改。SQL 是診斷查詢，不放入 `supabase/migrations`，也不建立函式或資料表。

本階段不需要使用者手動操作。之後若要重跑：Supabase Dashboard → Personal_Store_Web → SQL Editor → New query → 貼上該 SQL 檔案完整內容 → Run。查詢回傳一個 `capacity_audit` JSON，包含所有 table 排行、Storage 分類、例句所有權、個人用量合計與一致性 checks。可用 Export 保存 JSON；不要貼出 API 金鑰或帳號內容。無需新 Secret、無需重新部署、無需為唯讀查詢做資料 migration 或 rollback；若查詢 timeout 且同一 session 仍在交易中，先執行 `ROLLBACK;`。

## 下一步

停在 Phase 0。等待使用者確認後，才執行 Phase 1：Storage 抽象層；default provider 維持 Supabase。此階段不決定 Neon/Turso，不建立 R2，不搬移舊資料。
