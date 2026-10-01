# 行程通知：Server Configuration 修正與剩餘設定

## 結論

本輪直接查核 Vercel Production 環境變數名稱：`CALENDAR_DISPATCH_SECRET` 缺少，是目前 `SERVER_NOT_CONFIGURED` 的確定原因。
`VAPID_PUBLIC_KEY`、`NEXT_PUBLIC_SUPABASE_URL` 已存在。沒有讀取或輸出任何 Secret 的值。

原本也缺少 `NEXT_PUBLIC_APP_URL`；已直接新增 Production 設定為 `https://personal-store-web.vercel.app`。
此設定要在下一次 Vercel Production 部署後才會套用到執行中的網站。

Supabase Secrets 唯讀查核遇到 403（帳號缺少專案權限），所以 Edge 的 Private Key、Subject、派送密鑰與實際部署版本均尚未確認。
不能把「無法查核」寫成 missing，也不能宣稱真實 Apple Push 已成功。

## Runtime 與設定位置

Next.js API → `push-dispatcher.ts` → Supabase `send-calendar-test-push` → Web Push Provider → 裝置 Service Worker。
Next.js 不執行 `web-push.sendNotification()`。既有正式 Reminder 也是由 Supabase Edge 發送，不是另一套 Vercel Web Push Sender。

| 設定 | Vercel Production | Supabase Edge |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 存在 | 不需要；使用平台的 `SUPABASE_URL` |
| `CALENDAR_DISPATCH_SECRET` | **缺少，需要補上原本的值** | 尚未確認；需與 Vercel 相同 |
| `VAPID_PUBLIC_KEY` | 存在 | 尚未確認；需與 Vercel 相同 |
| `VAPID_PRIVATE_KEY` | 不需要放這裡 | 尚未確認；真正 Sender 需要 |
| `VAPID_SUBJECT` | 不需要放這裡 | 尚未確認；真正 Sender 需要 |
| `NEXT_PUBLIC_APP_URL` | 已補固定 Production Origin | 此 Test Function 不依賴此設定 |
| `SUPABASE_URL` / Admin Key | Next 使用既有 Supabase 設定 | 平台 URL 與 Admin Key 必須可用 |

Edge Admin Key 沿用既有 fallback：`SUPABASE_SECRET_KEY` → `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEYS.default`。
診斷中的 `SUPABASE_SERVICE_ROLE_KEY` configured 指「這組既有 Admin Key fallback 可用」，不代表只允許舊 key 名稱。

`SERVER_NOT_CONFIGURED` 只檢查 Vercel 的 `NEXT_PUBLIC_SUPABASE_URL`、`CALENDAR_DISPATCH_SECRET`、`VAPID_PUBLIC_KEY`。
`NEXT_PUBLIC_APP_URL` 缺少只影響正式 Origin 顯示，不是這個錯誤的觸發條件。
Edge 缺少發送設定會回另一個代碼 `EDGE_NOT_CONFIGURED`；密鑰不一致會回 `DISPATCH_UNAUTHORIZED`。

## 本輪程式修改

- `src/lib/calendar/push-dispatcher.ts`：列出 Vercel 設定存在性、allowlist Edge 設定狀態；設定缺少時不呼叫 Edge。逾時的發送結果為未知，不冒充「沒有送出」。測試成功必須具有 `PUSH_ACCEPTED` 與 2xx Provider status。
- `src/lib/calendar/push-diagnostics.ts`：共用安全診斷型別。
- `src/app/api/calendar/push-subscription/route.ts`：只有已登入使用者可取得 Vercel / Edge 的 configured / missing；保留既有訂閱 GET / POST / DELETE 流程。
- `src/app/api/calendar/test-push/route.ts`：增加 `serverConfigured`、`subscriptionFound`、`pushAttempted`、`pushProviderStatus`、`invalidSubscription`、`serverBuild`。Unknown 回 null；保留登入、Origin、owner、enabled、UUID 與 burst guard。
- `supabase/functions/send-calendar-test-push/index.ts`：只有通過 private header 才揭露設定存在性；區分已找到訂閱、是否呼叫 Provider 與訂閱失效，不回 endpoint / auth / p256dh / Private Key / Provider body。
- `src/lib/calendar/push-test-history.ts`（新增）：此瀏覽器、帳號與訂閱分開保存最後 Provider accepted 時間與 `last_confirmed_received_at`。只存兩個時間，不存 Push 憑證。
- `src/components/calendar/calendar-notifications.tsx`：只補診斷細節、明確未設定訊息與 Detail 裡的「我已收到」。確認是使用者回報，不等同伺服器自動證實裝置收到。
- `scripts/calendar/push-diagnostics.test.cjs`、`scripts/calendar/push-notification-browser.cjs`：安全、結果語意、資料隔離與 Responsive 回歸。

沒有變更權限要求、Service Worker、subscribe/unsubscribe、行程表單、資料庫 schema、Cron 或 Reminder Function。
沒有新增 Environment Variable 名稱，沒有產生／更換 VAPID Key Pair。

## 你現在需要完成的設定

1. 開啟 Vercel → `personal-store-web` → Settings → Environment Variables。
2. 新增 **既有名稱** `CALENDAR_DISPATCH_SECRET`，Environment 選 **Production**。
3. Value 必須是 Supabase Edge 已使用的同一個派送密鑰。請從你原本安全保存的位置取出，私下填入 Dashboard，**不要貼到對話或 Commit**。
4. 不要另外產生不同的密鑰。若找不到原本值，先由有權限的管理員查核既有設定，避免與 Edge / Cron 的既有密鑰失配。
5. `NEXT_PUBLIC_APP_URL` 已補上，不必重複新增，也不要改成 Preview URL。
6. 使用能存取專案 `vnikvpgjwxkrspklmfwz` 的 Supabase 帳號，檢查 Edge Secrets 是否已有 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`、`CALENDAR_DISPATCH_SECRET`。保留原本長期保存的 Key Pair。
7. 手動部署本輪專用 Test Push Function；403 時先確認登入帳號與專案角色，不是靠重試或修改手機訂閱能解決。
8. 手動部署網站到 Vercel Production，讓新環境變數生效。Git push 只有在現有 Git integration 啟用 Production 自動部署時才會觸發部署；到 Vercel Deployments 確認 commit 與 Ready 狀態。
9. iPhone 用固定正式網址開啟 PWA → 行程通知 → 重新同步裝置。這次仍沿用原本的 Subscription，不需重新授權。
10. 診斷確認兩端設定正常後，按「發送測試通知」。未設定訊息消失不等於實際收件；需看到 `PUSH_ACCEPTED`、Provider 2xx，再確認手機通知。

Vercel 設定只影響後續 Deployment，參考 [Vercel Environment Variables](https://vercel.com/docs/environment-variables)。
Supabase Edge Secrets 與 Vercel 是不同 Runtime，參考 [Supabase Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets)。

## 實機驗證順序（尚未執行／不可假報）

1. iPhone PWA 在前景：由此裝置的 Test Push 按鈕測試，看到通知後才按「我已收到」。
2. PWA 回主畫面：先安全排定／由可信 Server 端觸發同一個 iPhone Subscription 的 Test Push，再確認收到。
3. PWA 未開啟且 iPhone 鎖屏：由可信 Server 端觸發同一個 iPhone Subscription，確認鎖屏通知。

另一台電腦按自己的 Test Push 按鈕只測試自己的訂閱，不會自動測試 iPhone；不能拿電腦成功冒充 iPhone 背景成功。
第二、三項需要有權限的操作端使用既有私密 dispatcher 驗證，禁止公開 endpoint、私密密鑰或新增不受驗證的測試入口。

只有真實 Test Push 成功後，才檢查 `calendar-reminder-dispatch` 的 Job、Schedule、Enabled、Last Run 以及 `Asia/Taipei` 行程提醒。這輪沒有修改排程。

## 26 項回報

| # | 項目 | 結果 |
| --- | --- | --- |
| 1 | 錯誤來源 | `src/lib/calendar/push-dispatcher.ts` |
| 2 | 檢查 env | Vercel 的 Supabase URL / Dispatch Secret / VAPID Public Key |
| 3 | 目前缺失 | Vercel Production 的 `CALENDAR_DISPATCH_SECRET` |
| 4 | Public Key | Vercel 存在；Edge 待查核 |
| 5 | Private Key | Edge 待查核（403）；Vercel 不需要 |
| 6 | Subject | Edge 待查核（403）；Vercel 不需要 |
| 7 | 實際 Sender | Supabase Edge Function |
| 8 | Secrets 位置 | Dispatch Secret 兩端相同；Private Key / Subject 在 Edge |
| 9 | Key 固定 | 程式沒有 build / startup / deploy 生成 Key 的流程；本輪沒有更換 |
| 10 | Key Pair 一致性 | 手機診斷確認 Subscription / Vercel Public Key 相同；Edge 公私鑰 pair 尚未實證，不能宣稱已確認 |
| 11 | Origin env | 沿用 `NEXT_PUBLIC_APP_URL` |
| 12 | Production Origin | 已在 Vercel Production 設定指定固定網址；需新版部署生效 |
| 13 | Preview Origin | 沒有使用 Preview 網址作正式 Origin |
| 14 | Server Test Push 修好 | 診斷程式已完成；線上發送仍待補密鑰與部署，尚未完成 |
| 15 | HTTP / Provider | 模擬成功 HTTP 200 / Provider 201；真實 Provider 尚未送出與驗證 |
| 16 | iPhone 前景 | 待實機測試 |
| 17 | iPhone 非前景 | 待實機測試 |
| 18 | iPhone App 未開 | 待實機測試 |
| 19 | iPhone 鎖屏 | 待實機測試 |
| 20 | Calendar Cron | 尚未開始查核；按要求先等真實 Test Push 成功 |
| 21 | Timezone | 既有資料 default / normalization 為 `Asia/Taipei`；真實排程時間未驗證，未修改 |
| 22 | Deploy 保留訂閱 | 訂閱程式完全未修改；既有訂閱重用測試通過 |
| 23 | 重新允許通知 | 不需要；不因 Server 未設定而解除／重建訂閱 |
| 24 | build | `npm run build` 通過 |
| 25 | lint | 本輪 9 個程式／測試檔案 0 error / 0 warning；全站仍有既有 89 errors / 50 warnings，未擴大修正 |
| 26 | typecheck | `npx tsc --noEmit` 通過 |

## 自動測試

- 15 個實際 helper / API / Edge / SW 模擬測試全部通過。
- Browser：375 / 390 / 430 / 700 / 701 / 768 / 820 / 821 / 1024 / 1440px，明暗模式無橫向溢出。
- Server 未設定不假成功、缺失 env 名稱可辨識、Private Key 等值不外洩。
- 使用者確認接收與 Provider accepted 分開；重新載入可保留、不同帳號／訂閱不共用紀錄。
- Provider 404 / 410 / 401 / 403 / 429 / 500、timeout unknown、owner / Origin / auth / rate guard 測試通過。
- 這些測試使用 isolated doubles；不是 Apple Provider 或 iPhone 收件證據。

本輪沒有 Commit、Push 或部署網站／Edge；只有按需求新增固定網址的 Vercel Production 設定。
