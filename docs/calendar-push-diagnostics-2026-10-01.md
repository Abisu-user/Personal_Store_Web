# 日曆通知診斷：Phase 1–3 與 Phase 4 實機驗收交接

## 本輪範圍與結論

依需求先做 Audit、分層 Diagnostics、真正 Server-side Test Push。**整個通知修復尚未完成**：需要先部署診斷版，確認 iPhone 在 App 未開啟時收到測試推播，才能進入 Phase 5 Cron／Reminder 修改與 Phase 6 全站啟動 reconcile。

目前不能證實「通知完全收不到」的唯一根因。不能把 HTTP 接受、DB 訂閱存在或本機環境缺少金鑰，當成 iPhone 接收成功或正式環境缺少金鑰的證明。

### 唯讀正式 Supabase 實際查詢

專案：`vnikvpgjwxkrspklmfwz`。未修改資料、未呼叫 claim RPC、未發真實通知。

- `calendar_push_subscriptions`：2 筆，皆 enabled，User Agent 皆屬 iPhone。
- `calendar_event_reminders`：1 筆。
- `calendar_notification_deliveries`：0 筆。
- 有提醒的行程：2026-10-01、15:00、Asia/Taipei、daily、offset 5 分鐘。其當日 scheduled_at 應為 14:55 台北／06:55 UTC。沒有讀出行程標題、備註、endpoint 或 keys。
- 訂閱最近更新時間：03:14:30.906 UTC、06:36:59.668 UTC。
- 這些是查詢當下的快照。兩筆 iPhone 列不一定代表兩台實體手機，也可能是不同 PWA 安裝／Origin；無法從 UA 判定。
- 本機 `.env.local` 有 Supabase 設定，沒有 VAPID_PUBLIC_KEY、CALENDAR_DISPATCH_SECRET、NEXT_PUBLIC_APP_URL；**不代表 Vercel／Edge 也缺少這些設定**。
- 本機 Vercel link 顯示 projectName `personal-store-web`，但沒有核實正式網域，亦未取得使用者實際 PWA URL。

## 已修改檔案

- `.env.example`：新增 server-only CALENDAR_DISPATCH_SECRET 的說明。
- `src/app/api/calendar/push-subscription/route.ts`：安全的 config／Edge 公鑰核對；以 POST body 查詢裝置訂閱，避免 endpoint 出現在 GET URL；sync 回傳已保存的裝置 id／狀態／updated_at。
- `src/app/api/calendar/test-push/route.ts`：登入驗證、同 Origin 檢查、指定裝置 owner 驗證、短期 burst guard，再交給 Edge 真正推播。
- `src/lib/calendar/push-dispatcher.ts`：伺服器對 Edge 的私密連線、逾時及安全錯誤碼。
- `src/lib/calendar/push-diagnostics.ts`：共用狀態判斷、公鑰比較、ID 遮蔽。
- `src/lib/calendar/push-device.ts`：分層檢查／手動同步／已授權訂閱修復；不重複要求權限、不因 DB 暫時失敗刪除訂閱。
- `src/components/calendar/calendar-notifications.tsx`：通知詳情、測試推播、重新同步、修復、關閉裝置。
- `src/components/calendar/calendar-mobile.module.css`：僅新增通知詳情與按鈕布局；保留其他已 staged 的 Header 修改。
- `supabase/functions/send-calendar-test-push/index.ts`、`policy.ts`：獨立測試 Function。**不會執行提醒 claim 或 Cron**；與現有派送 Function 使用相同 Supabase 專案 secrets。
- `scripts/calendar/push-diagnostics.test.cjs`、`push-notification-fixture.tsx`、`push-notification-browser.cjs`：隔離測試。
- 本文件及 `docs/calendar-web-push-setup.md`：部署與驗收補充。

未修改 Calendar CRUD、Event Modal、Reminder Picker、Background Save Queue、舊 dispatcher、SQL migration、DB/RLS、登入或 App Lock。既有 App Lock 未 staged 變更與上輪 Header staged 變更均保留。

## 43 項診斷回報

1. 原「已開啟」條件：GET 回傳 VAPID 公鑰非空，browser subscription 存在，DB 中同 owner＋endpoint 有 enabled row。enable 成功時亦直接設成 on。
2. **不是單看 Notification.permission**。原流程缺少 active/scope、公鑰一致性、Dispatcher 設定與真實測試；enable／inspect 的判定也不一致。新判斷共用模型，至少四層正常，再要求公鑰與 Edge 設定正常、無檢查錯誤。
3. iPhone 現在的 browser PushSubscription：無實機存取，未知。伺服器存在兩筆 iPhone 訂閱不是 browser 仍有效的證明。
4. Supabase 確實有兩筆 enabled 訂閱；是否其中一筆對應正在測試的 Origin／安裝，待新 UI 核對。
5. 現有欄位：id、owner_id、endpoint（unique）、p256dh、auth、user_agent、enabled、created_at、updated_at。沒有 user_id unique，支援多裝置。
6. 程式從環境讀固定 VAPID。新診斷比較 Next 公鑰、browser subscription applicationServerKey、Edge 公鑰。
7. 沒找到 build/deploy 自動生成 VAPID 的程式。未讀出正式 private key，不能聲稱平台上的金鑰從未被人換過。不可重新生成作為常规部署步驟。
8. 正式固定 Origin：未取得。新詳情列出目前 Origin 與 NEXT_PUBLIC_APP_URL 的正式 Origin；不同時警告。
9. 使用者是否用 Preview URL：未確認，不做推測。已向使用者詢問實際 PWA 完整 URL。
10. SW 註冊為 `/sw.js`、scope `/`；ready 有時間上限，且檢查 active 為 activated、scope 涵蓋根 Origin。
11. 現有 push handler 使用 event.waitUntil＋showNotification，非頁面 timer。
12. 現有 notificationclick 有同 Origin window navigate/focus 與 openWindow，payload 指向 calendar 日期／event。沒有改為首頁。
13. 已新增真正 Server Test Push：Client → 驗證身份與指定裝置的 Next API → 獨立 Edge → Web Push Provider → SW。
14. 實際正式 Test Push HTTP／provider response：尚未發送。隔離測試的 201/403/404/410 等回應是替身，不能當成 Apple 的實際回應。新 UI 顯示真實 Next HTTP、provider status、安全 code。
15. App 完全沒開時 Test Push：尚未實測，是 Phase 4 門檻。
16. Cron 現在是否存在：尚未查 live cron schema。使用者先前截圖曾證實存在；不能把歷史截圖當本輪 live proof。
17. 歷史名稱 `calendar-reminder-dispatch`、schedule `* * * * *`、active true。沒有重建或增加重複 job。
18. 最近 Cron run／下一次 run：未取得，需 SQL Editor 查詢。若仍為每分鐘且 active，下一個排程 tick 應是下一分鐘；不能保證實際執行時間。
19. Cron 是否真的叫到 Edge：未取得 live logs；僅 Function 曾部署不足以證明呼叫正常。新 Test Function 與 Cron Function 分離，不會干擾其排程。
20. 實際 due query 是否查得到：未執行，因 `claim_due_calendar_reminders` 會寫入 claim，不適合當唯讀探針。只核對現有 SQL 與提醒資料；0 deliveries 仍需 Cron／Edge logs 定位。
21. 現有 SQL 以 make_timestamptz(..., e.time_zone) 生成 UTC timestamptz，再扣 offset。
22. 唯一提醒的 time_zone 是 Asia/Taipei。台北 15:00＝UTC 07:00；提前 5 分鐘＝UTC 06:55。未改成伺服器預設時區。
23. 現有 delivery status 是 claimed/sent/failed/skipped，另有 claimed_at/sent_at/attempt_count/error_message。沒有改名或建立第二張表。
24. SQL INSERT＋unique(event_id, reminder_id, occurrence_date, event_revision)＋ON CONFLICT DO NOTHING 做原子 claim；不以單純 sent=false SELECT 當鎖。
25. 現有 claim 接受到期但五分鐘內的提醒；超過窗口不補送，也不生成 expired 記錄。舊 sender TTL 3600 秒可能導致 provider 接受後延遲顯示，列入 Phase 5 核查；本輪尚未修改。
26. Daily：現有 SQL 每次動態產生 offset 附近日期的 occurrence；不是首筆 sent=true 就永久停用。實際第二天接收尚未驗證。
27. Weekly：以與 event_date 差值 mod 7 判斷下一週 occurrence。實際下一週接收尚未驗證。
28. Yearly：依月／日判斷 occurrence；沒有十年預生成。閏日等邊界與實際接收留待 Phase 5。
29. Schedule 欄位變更會增加 reminder_revision；派送前再次比對 event revision。未改這套流程，也不能聲稱消除所有跨 DB／network race。
30. 刪除 event/rule 有 FK cascade，sender 重查不存在就不送。現有紀錄被 cascade 刪除，而非留下 cancelled；完整歷史設計待 Phase 5 評估。
31. 舊 reminder sender 已對 404/410 disable。新 Test Function 同樣 disable 指定 owner＋id；不因 401/403 任意刪除訂閱。
32. 本輪**開啟通知設定**會檢查並修復：granted＋null → subscribe；exists＋server missing → sync；既有 row enabled → 更新 updated_at。全站 App 啟動 reconcile 尚未接入，依 Phase 6 順序保留。default/denied 不自動彈權限。
33. 未找到 unregister。現有 PwaClient 是 register/update，SW 只清理舊 shell cache，沒有刪 registration。新同步重用既有訂閱；正式同 Origin redeploy 保留仍需實機驗證。
34. Permission／SW／subscription 不能跨 Origin 搬移。新網域需在該環境訂閱；不能靠 LocalStorage enabled flag 冒充。
35. 頁面與伺服器 Build 使用 NEXT_PUBLIC_BUILD_ID；來源由 next.config.ts 生成。新 UI 可對照兩者，未固定假值。
36. Active Worker 版本由既有 PERSONAL_VAULT_VERSION message 取得；舊 Worker 不提供時顯示未取得。
37. **本輪沒有 migration、沒有改正式 DB**。最近同步重用 updated_at；沒有謊稱新增 last_seen_at／last_success_at。最後測試送出只保留本次設定視窗狀態，不是永久的每裝置成功紀錄。需持久化與接收回報設計時在 Phase 6 明確補上。
38. 原三張表 RLS enabled，anon/authenticated revoked；沿用 authenticated server owner filtering＋server-only service role。新測試 API 在 Next 與 Edge 皆驗證 owner＋指定 subscription id，不回傳 endpoint/keys。
39. 新 `send-calendar-test-push` 尚未部署；沒有修改／重新部署舊 `send-calendar-reminders`。需要下方命令；project-level 既有 secrets 可共用。
40. npm run build 通過；新增 `/api/calendar/test-push` 已編譯。
41. 本輪檔案 lint 通過。全專案 npm run lint 仍為原本 89 errors／50 warnings，並非全站 lint 通過。
42. npx tsc --noEmit 通過。Next typecheck 排除 supabase/functions；Edge 經 TypeScript transpile 與隔離 handler 測試，尚未用 Deno CLI 或正式 Edge runtime 驗證。
43. 真實 iPhone／Safari／Apple Push／鎖屏未測。Edge 瀏覽器測試為獨立 fixture＋mock Push/DB/provider，驗證 UI 与安全分支，不代表真實設備收到通知。

## 測試證據

- 分層測試 11 組通過：default/denied 不 prompt、granted/null 修復、缺 server row、重用訂閱、停用 opt-out、不活躍 SW、公鑰不符、DB 暫時失敗、Safari gesture 拒絕、Edge 授權／owner、provider error／invalid disable、Next auth/origin/owner/burst guard、既有 SW push/click。
- 真正 React 設定視窗 fixture：375 / 390 / 430 / 700 / 701 / 768 / 820 / 821 / 1024 / 1440px，light/dark、無橫向溢出、視窗不超出 viewport、ID 遮蔽、201 接受文案≠接收成功、403 失敗、關閉後不自動重開。未改 Calendar CRUD。
- 既有 SW cache/version 測試通過。沒有因這輪新增測試而移除或變更 SW。
- iOS 自動 subscribe 若被 Safari 要求 gesture，UI 會保留未完成狀態並提供「修復通知」；不重複 requestPermission。Apple 文件也要求 subscribe 緊接使用者 gesture，不能承諾每個 iOS 狀態都能無手動操作修復。
- Best-effort 15 秒 burst guard 是 Next server instance 記憶體，不是全域限流或安全邊界；授權／owner 檢查才是邊界。
- 已失效或公鑰不符的既有 browser subscription 不直接重新 sync 成 enabled：先「清除舊訂閱」，再由下一次手動 gesture「修復通知」建立新訂閱，避免反覆重用已被 provider 拒絕的 endpoint。一般暫時性 DB 失敗不採取這個清除流程。

## 部署診斷版（不要產生新金鑰）

1. 在 **Vercel → personal-store-web → Settings → Environment Variables → Production** 檢查：
   - `VAPID_PUBLIC_KEY`：與 Supabase 原固定公鑰相同。
   - `CALENDAR_DISPATCH_SECRET`：與 Supabase Edge／Vault 原派送密鑰相同；新增到 Vercel，**不要加 NEXT_PUBLIC_**。
   - `NEXT_PUBLIC_APP_URL`：實際固定正式網址，而非每次變動的 preview。
2. Supabase → Edge Functions → Secrets：沿用原 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`、`CALENDAR_DISPATCH_SECRET`。不要重生 key pair。不要把任何 secret 貼進聊天或 Git。
3. 新測試 Function 單獨部署：

```powershell
Set-Location -LiteralPath "C:\Users\User\Documents\Codex\2026-08-14\sites-plugin-sites-openai-bundled-2\vault-app"
npx supabase functions deploy send-calendar-test-push --project-ref vnikvpgjwxkrspklmfwz --no-verify-jwt
```

`--no-verify-jwt` 僅關閉 gateway JWT 檢查，Function 內仍強制私密派送 header；瀏覽器只呼叫自己的 Next API，不直接呼叫 Function。

4. 推送本輪網站程式，讓 Vercel 使用新 Production env 重新 build/deploy。**網站部署與 Edge 部署是兩件事，單純 git push 不會部署 Supabase Function。**
5. 在 iPhone 固定正式網址的主畫面 PWA → 日曆 → 行程通知 → 重新同步 → 展開詳情 → 發送測試通知。提供安全 code／HTTP／provider status、頁面與 Worker 版本、實際收到與否即可；不要提供 endpoint/keys。

### App 完全關閉的獨立測試

先在手機完成訂閱；在電腦 Supabase SQL Editor 只查 id/owner，不查 push keys：

```sql
select id, owner_id, enabled, user_agent, updated_at
from public.calendar_push_subscriptions
order by updated_at desc;
```

選出與手機診斷 ID 對應的 row。接著完全離開手機 PWA並鎖屏，**從電腦** Supabase Dashboard → Edge Functions → `send-calendar-test-push` → Test/Invoke，以 POST 呼叫：

```json
{
  "action": "test",
  "expectedPublicKey": "原固定 VAPID_PUBLIC_KEY",
  "ownerId": "該 row 的 owner_id",
  "subscriptionId": "該 row 的 id"
}
```

Headers 加入 `Content-Type: application/json` 與 `x-calendar-dispatch-secret: 原派送密鑰`，僅在可信管理介面填寫，不截圖分享 header。成功應回 `PUSH_ACCEPTED`＋provider status，但**驗收仍要手機真的顯示通知**。這條流程不需要 App 在背景、沒有 client timer、不經 Cron；不要只在手機按下後立刻收到就宣稱已測到完全關閉。

## Phase 5 所需唯讀資料（在 Supabase SQL Editor，不是 PowerShell）

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'calendar-reminder-dispatch';

select d.jobid, d.status, d.start_time, d.end_time, d.return_message
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname = 'calendar-reminder-dispatch'
order by d.start_time desc
limit 10;

select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc
limit 10;
```

Cron job run success 可能只代表 pg_net 已排隊；還要對照 HTTP status 與 Edge logs。以上不顯示 Vault decrypted secrets 或 HTTP body。現有台北 14:55 提醒若未產生 delivery，需確認當時 Cron／Edge 是否成功，不能直接猜是 iOS 問題。

Phase 5 待處理／驗證：Cron live run、due query 安全探針、結構化 run log、過期紀錄與 TTL、跨次 occurrence、edit/delete 邊界。Phase 6：全站啟動 reconcile、持久 last_seen／last_success 設計、manifest identity 顯式化、同 Origin 部署與 opt-out／帳號切換實機驗證。

## 平台依據

- [WebKit：iOS/iPadOS Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Apple：Web Push 設定與直接使用者互動](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
- [MDN：PushManager.subscribe 與 applicationServerKey](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)

這些平台說明不代替本專案實機驗收，尤其不證明特定 Force Quit／Focus／系統通知設定下必定收到。
