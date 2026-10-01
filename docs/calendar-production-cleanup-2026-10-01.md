# Calendar 正式通知收尾與 Scheduler 驗收

## 範圍與目前結論

使用者已確認 iPhone 實際收到 Test Push；此基礎能力視為已完成，不重新研究、不重做。
本輪只清理 Production 通知介面、接入既有 startup reconcile、補回歸測試與 Scheduler 驗收。
沒有 commit、push、deploy、secret 更換、資料庫寫入或 migration。

正式 Calendar Reminder（不是 Test Push）的背景／鎖屏實際接收，尚未取得實機確認。
不把 HTTP 成功或 delivery `sent` 當成裝置已收到。

## 修改檔案

正式程式：

- `src/components/calendar/calendar-notifications.tsx`：Production 隱藏全部測試／診斷呈現、保留設定操作與友善錯誤。
- `src/lib/calendar/push-diagnostics.ts`：增加純呈現狀態映射，原本 health model／strict enabled gate 不變。
- `src/components/calendar/calendar-push-reconciler.tsx`：新增極小的登入後啟動入口，沿用 `inspectPushDevice`，不另寫訂閱流程。
- `src/app/(app)/layout.tsx`：在原有登入後 Layout／AppLockProvider 內掛載 reconciler。

測試／文件：

- `scripts/calendar/push-diagnostics.test.cjs`
- `scripts/calendar/push-notification-browser.cjs`
- `scripts/calendar/push-notification-fixture.tsx`
- `scripts/calendar/reminder-dispatcher.test.cjs`（新增）
- `scripts/calendar/reminder-acceptance-readonly.sql`（新增）
- 本文件

沒有修改 `push-device.ts`、Push API、兩個 Edge Sender、Service Worker、VAPID validation、提醒 RPC／migration、Background Save 或多裝置資料結構。
工作樹中既有的 `app-lock-provider.tsx` 修改不屬於本輪，保留不動。

## 正式介面與健康判斷

正常開啟後只顯示：通知說明、此裝置／已開啟、重新同步裝置、關閉此裝置通知、完成。
未開啟時提供開啟按鈕；未授權、系統封鎖、不支援、同步失敗、伺服器不可用時使用一般使用者能理解的提示。
不猜測 iPhone 型號。

六種正式狀態為：已開啟、尚未開啟、需要重新同步、通知已被系統封鎖、此裝置不支援、伺服器暫時無法使用。
已開啟仍要求 support + granted + active/root-scope Worker + subscription + applicationServerKey 相符 + enabled server row + dispatcher ready + 無檢查錯誤。
明確的此裝置 opt-out 優先顯示尚未開啟；非 opt-out 的失效 server row 不冒充正常開啟。

`process.env.NODE_ENV !== "production"` 是唯一 Debug UI gate；沒有 query string／localStorage／公開開關能在 Production 顯示診斷。
Development 保留「開發者診斷」、測試通知與人工接收確認，Production 不讀取／更新 Test Push history。
底層 permission／worker／subscription／registration／key match／dispatcher／error code／版本與安全指紋檢查保留。

## 同步、多裝置與部署延續

本輪發現此前 App startup 只註冊 Worker，reconcile 僅在打開通知設定時執行；新增入口補足需求。
登入後 App 掛載且 permission 已 granted 時，靜默呼叫既有 `inspectPushDevice` 一次。
Strict Mode 重複 effect 有 ref gate；default／denied 不自動發出權限請求、不自動建立訂閱。
沿用既有 helper 的 opt-out／disabled row／key mismatch 防護、遺失 subscription repair 與 server upsert。
正常同步無 toast；失敗可從設定視窗手動 recovery。

同步更新的是現有 `updated_at`（API 的 `lastSyncedAt`），目前**沒有 `last_seen_at` 欄位**；不為名稱差異新增 migration。
同 Origin 重啟／部署重用既有 endpoint，不重新 generate keys、不重設訂閱、不要求重裝 PWA。
原本同一 owner 多裝置保留，沒有 `owner_id/user_id unique`；關閉僅 owner + current endpoint，保留其他裝置。

## Test API 與儲存

`/api/calendar/test-push` 保留以供維護，Production 無 UI 入口。
原有安全限制未移除：security context 登入檢查、same-Origin POST、UUID schema、subscription ownership + enabled、15 秒限流、私有 Edge dispatch secret。
限流是目前既有的 process-local Map，並非分散式／全域限流；沒有宣稱其可防止所有跨 instance 濫用。
API 可由已登入且擁有該訂閱的人手動呼叫，並非另新增管理員專屬 endpoint。

`last_confirmed_received_at` 位於按裝置／帳號／訂閱隔離的 localStorage 測試歷史，不是本專案 DB 欄位。
程式與 migration 沒有發現 `last_test_sent_at/last_test_provider_status/last_test_http_status` 正式 DB 依賴。
不刪 localStorage 舊紀錄；Production 停止呈現與讀寫，Dev-only 保留。沒有 drop column。
真正的 `calendar_notification_deliveries` 完全保留。

## Scheduler 唯讀驗收與限制

本輪已成功查到的 Cron snapshot（2026-10-01）：

| 項目 | 結果 |
| --- | --- |
| Job | `calendar-reminder-dispatch`（jobid 1） |
| Schedule | `* * * * *`（每分鐘） |
| Active | true |
| Target | 包含正式 `/functions/v1/send-calendar-reminders` |
| 最近執行 | 台北 22:51:00.020538 開始、22:51:00.032848 結束，succeeded |
| 下次估計 | 該 snapshot 算出的台北 22:52；僅整分鐘估計，不是 pg_cron 提供的 next-run metadata |

Cron succeeded 只代表 SQL/pg_net enqueue 成功，不代表 Edge 回應成功、更不代表手機接收。
後續 delivery／pg_net HTTP 查詢遇到 CLI `IPv6 is not supported on your current network`，未取得足以證明正式 Reminder 發送的 live 結果。
沒有為此重新 link／更改 DB 連線／更改 production 設定。
可將 `scripts/calendar/reminder-acceptance-readonly.sql` 複製到此專案 SQL Editor 執行：只輸出安全欄位與聚合，不顯示 secret、endpoint、keys、owner 或行程標題。
其中 pg_net HTTP 是所有近期 caller 的聚合，必須搭配 Reminder Edge invocation log／delivery 時間確認來源，不能單獨歸因於 Cron。

現有 Scheduler 實作未改動：

- DB 原子 claim + `(event_id, reminder_id, occurrence_date, event_revision)` unique 防重。
- `none` exact day、`daily` anchor 後每天、`weekly` anchor 每七天、`yearly` 同月日；2/29 僅閏年。
- `make_timestamptz(..., e.time_zone)` 處理當地時間；預設 Asia/Taipei，offset 跨日亦按當地 occurrence 轉換。
- 每分鐘掃最近五分鐘到期項目，沒有提前生成 future delivery。
- 時間／日期／recurrence／timezone 等修改 bump revision；發送前再次查 event revision 與 reminder 是否存在。
- offset 移除刪除對應 rule；新增 offset 使用新 reminder_id；event／rule 刪除 cascade delivery。
- 發送前檢查可防止已修改／刪除的 stale claim，但檢查後到 provider 網路送出的競態仍可能存在，沒有宣稱能撤回已送往 provider 的通知。
- 已成功送出的同 occurrence 若再修改 revision，可能產生新的到期 delivery；不是保證修改永不再提醒。
- 404/410 僅停用該 endpoint；同一帳號其他有效裝置繼續。
- 正式狀態實際為 `claimed/sent/failed/skipped`，保留 `sent_at/error_message/attempt_count`。**沒有**另建 `scheduled/processing/cancelled/error_code` 欄位或狀態。
- Process crash／超過五分鐘的中斷可能漏送；現有實作沒有 claimed timeout 自動重試。本輪遵守 Push Core 不改原則，不順便做重試架構。

## 實機驗收流程（仍需完成）

1. 使用同一正式 Origin 的 iPhone PWA，確認行程通知「此裝置／已開啟」。
2. 新增現在起 **10 分鐘後**的非重複行程，提醒提前 **5 分鐘**；先等 Background Save 完成，避免尚未儲存就離開。
3. 離開 PWA，確實不在前景並鎖屏；到了約五分鐘後檢查通知。
4. 同時查看 SQL 的 delivery `scheduled_taipei/claimed_taipei/accepted_taipei/status` 與 Edge invocation。`sent` 是 provider accepted，須另由 iPhone 確認接收。
5. 對 daily／weekly／yearly 分別建立未來測試 occurrence，含非首次 occurrence 的案例；檢查 anchor 前不送、下一個 occurrence 能送。
6. 分別在提醒前修改時間、offset、recurrence 或刪除測試行程，確認舊時間不送、新時間正確；修改後同樣等儲存完成。
7. 不重裝 PWA、不重新產生 VAPID、不解除正常的通知權限。

未操作登入使用者的真實行程，也未發送額外 Test Push；目前不能代替使用者確認鎖屏／背景通知。

## 27 項回報

| # | 項目 | 結果 |
| --- | --- | --- |
| 1 | 移除 Test UI | Production 不顯示測試訊息、HTTP、Provider、人工接收與診斷表 |
| 2 | 發送測試通知 | Production 移除，Development 保留 |
| 3 | 我已收到 | Production 移除，Development 保留 |
| 4 | 通知診斷詳情 | Production 整組移除；Dev-only 開發者診斷 |
| 5 | 底層 diagnostics | health、code、worker/build、key match／validation 保留 |
| 6 | Dev-only | 編譯時 NODE_ENV gate；公開 query 不可開啟 |
| 7 | 正式 Modal | 說明、裝置狀態、開啟（必要時）、重新同步、關閉、完成 |
| 8 | 重新同步 | 保留，重用同一 helper；正常成功靜默 |
| 9 | 關閉此裝置 | 保留，owner + current endpoint；不動其他裝置 |
| 10 | 正式已開啟 | 各層健康條件全部成立，不以 granted 單獨判斷 |
| 11 | Test Push API | 保留，無 Production UI 入口 |
| 12 | 權限 | 原 auth／Origin／ownership／enabled／15sec best-effort rate limit／private secret |
| 13 | VAPID | public/private/subject 完全未改 |
| 14 | Subscription | 正常 endpoint 保留、重用，沒有 rotation/reset |
| 15 | Cron | snapshot active／每分鐘／最近 succeeded；完整 HTTP→delivery 尚缺驗收 |
| 16 | Calendar Reminder 真實成功 | **尚未確認**；不可拿已成功 Test Push 代替 |
| 17 | App 沒開時提醒 | **待 iPhone 實測** |
| 18 | Lock Screen 提醒 | **待 iPhone 實測** |
| 19 | Daily | 本地 recurrence + unchanged dispatcher 測試通過；真實排程接收待驗 |
| 20 | Weekly | 本地 recurrence + unchanged dispatcher 測試通過；真實排程接收待驗 |
| 21 | Yearly | 本地 recurrence（含閏日）+ unchanged dispatcher 測試通過；真實接收待驗 |
| 22 | 修改重算 | 無 future-prefill；原 revision/rule 計算與 stale-claim 單元測試通過，live 待驗 |
| 23 | 刪除不再提醒 | 原 cascade 與發送前刪除檢查測試通過，live 待驗；已交給 provider 的通知無法撤回 |
| 24 | Asia/Taipei | UI／schema default 與 SQL conversion 已確認；live 欄位／到達時間待驗 |
| 25 | build | `npm run build` 通過（Next 16.3.1 Turbopack） |
| 26 | lint | 修改檔案 ESLint `--max-warnings 0` 通過；全站 `npm run lint` 仍有本輪範圍外的 89 errors／50 warnings，未假稱通過 |
| 27 | typecheck | `npx --no-install tsc --noEmit` 通過；專案目前沒有 npm `typecheck` script |

## 回歸測試

- 38 項日曆／Push／正式 Dispatcher 單元測試通過：`node --test scripts/calendar/push-diagnostics.test.cjs scripts/calendar/reminder-dispatcher.test.cjs scripts/calendar/calendar.test.mjs`。
- Production／Development 真實 React 模組的 mocked browser 測試：375／390／430／700／701／768／820／821／1024／1440，light/dark，無 overflow。
- Production 編譯 gate、public query 無效、零 Test Push request、友善錯誤、正常同步無訊息、opt-out、startup endpoint 重用與不自動 prompt 均通過。
- Development 測試通知 provider acceptance vs receipt、限流／VAPID／DB error、receipt persistence 保留。
- Browser fixture 使用 production NODE_ENV／React 的 webpack mode（單獨 fixture 停用 minifier），不是 Apple Push 真實接收測試。

本輪僅 Next 網站程式需要正常發布，**不需要重新部署 Edge Functions**、設定 secrets、DB migration 或重裝 PWA。
