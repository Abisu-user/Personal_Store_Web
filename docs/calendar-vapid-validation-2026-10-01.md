# VAPID_CONFIG_INVALID：逐項安全驗證

## 目前可確認的線上事實

使用者 iPhone 截圖顯示兩端所需 env 都存在、Origin / Build 一致、訂閱登記正常；HTTP 503、Provider 尚無回應、pushAttempted=false。
原版 `supabase/functions/send-calendar-test-push/index.ts` 的 `webPush.setVapidDetails(subject, publicKey, privateKey)` catch 是此錯誤的來源。
該 catch 原本沒有保留失敗項目，因此截圖無法區分 Subject / Public Key / Private Key；也不能推論 Key Pair 已正確。

本輪 Supabase 唯讀 secret-name listing 已可存取，確認所需 Secret 名稱存在（沒有讀取值）。
Vercel `env run` 不允許下載 Production Secret 的值，已安全停止 probe，沒有把空值誤報成線上缺設定。
尚未部署本輪程式，因此下表所有「正式值是否有效」仍須新版 Edge Runtime 的診斷結果；不猜測實際密鑰，也不宣稱 iPhone 已收到。

## 真正的 Implementation 與格式

Test Function：`send-calendar-test-push`。
Sender 仍是 Supabase Deno Runtime 使用 `npm:web-push@3.6.7`；沒有重寫 Sender。

依 [web-push 3.6.7 vapid-helper 原始碼](https://github.com/web-push-libs/web-push/blob/v3.6.7/src/vapid-helper.js)：

- `validateSubject()`：要求可解析 URL，protocol 為 `https:` 或 `mailto:`。
- `validatePublicKey()`：要求無 padding 的 URL-safe Base64，解碼 65 bytes。
- `validatePrivateKey()`：要求無 padding 的 URL-safe Base64，解碼 32 bytes 的 raw EC private scalar。不是 PEM、JWK 或 PKCS8。
- `setVapidDetails()` 只做原 library 的三項檢查，沒有保證 public/private 屬於同一 pair，也沒有完整檢查 public point 是否在曲線上。

本輪保留上述格式，增加 canonical Base64URL、uncompressed point 的 0x04 前綴、P-256 曲線檢查、私鑰 scalar import 與 derived public key 比對。
Subject 再要求有實際 mailto address / HTTPS hostname，不接受空聯絡資料、裸 email、裸站名、localhost、空白或引號。
不 trim、剝除引號、轉換 Base64 或自動更換正式 env，避免把錯誤設定悄悄掩蓋。

## 修改範圍

1. 新增 `supabase/functions/send-calendar-test-push/vapid-validation.ts`：逐項安全 metadata；只回 exists / length / flags / parse / decoded length / validity / issues / pairMatch / publicKeyMatch / public SHA-256 fingerprints。
2. `supabase/functions/send-calendar-test-push/index.ts`：私密派送 header 驗證後才執行與回傳診斷；public/private/subject/pair、公鑰兩端一致與 library validation 全通過才 serverConfigured=true。失敗不呼叫 Provider。
3. `src/lib/calendar/push-diagnostics.ts`：安全共用型別。
4. `src/lib/calendar/push-dispatcher.ts`：nested allowlist sanitizer；不接受 raw value / message / stack / 私鑰 fingerprint。舊 Edge 回 ready 但無驗證報告時，要求 EDGE_UPDATE_REQUIRED，不冒充 Key Pair 已驗證。
5. `src/app/api/calendar/push-subscription/route.ts`：在原 authenticated diagnostics 回傳安全結果。
6. `src/components/calendar/calendar-notifications.tsx`：只在原診斷 Detail 增加上述欄位與失敗項目；未改表單、授權或訂閱流程。
7. `scripts/calendar/push-diagnostics.test.cjs`、`scripts/calendar/push-notification-browser.cjs`：unit / security / Responsive 回歸。
8. 新增 `supabase/functions/send-calendar-test-push/vapid-validation.test.ts`：實際 Deno + npm web-push 的有效 JWT、加密 payload、曲線與錯誤格式測試。
9. 新增 `scripts/calendar/check-vapid-server.cjs`：唯讀 probe，只使用已具備的 server env，不輸出值、不發通知。沒有環境值時回「本機不可取得」，不推論 Production missing。

沒有修改 Calendar UI、Permission、Service Worker、Push Device、Cron、Reminder Scheduler / Delivery、Origin、DB schema、package.json 或 Key Pair。
沒有自動 unsubscribe、重新授權、產生／輪替密鑰、Commit、Push 或部署。
既有 `src/components/security/app-lock-provider.tsx` 修改與本輪無關，保留且不納入推送。

## Node / Deno Compatibility 實測

在隔離 npm/Deno cache 使用 Deno 2.9.6，不加入專案依賴、不修改 package lock：

```powershell
npx --no-install --package=deno deno test --node-modules-dir=none --no-lock --no-check --allow-env=ECE_KEYLOG,DEBUG,NODE_DEBUG supabase/functions/send-calendar-test-push/vapid-validation.test.ts
npx --no-install --package=deno deno check --node-modules-dir=none --no-lock supabase/functions/send-calendar-test-push/index.ts supabase/functions/send-calendar-test-push/vapid-validation.test.ts
```

實際 library 能 `setVapidDetails()`、加密 test payload、產生 ES256 JWT，並驗證其 signature / audience / subject / expiry。
沒有向 Apple 或任何真實 endpoint 發送測試，也不是正式 Supabase Runtime 的收件證明。
[Deno 支援 npm 與 Node compatibility](https://docs.deno.com/runtime/fundamentals/node/) 不代表只 build 就能確認每個 runtime 行為；本輪實測補強這一點。

Deno WebCrypto 的 import 在本測試中可接受非法 (0,0) 點，因此不能只依賴 import success；額外用 `ECDH.convertKey(..., 'prime256v1')` 明確拒絕 off-curve point，測試已通過。
沒有發現必須換掉 `web-push@3.6.7` 的問題；正式 Edge Runtime 是否同樣正常，仍需部署後驗證。

## 部署後如何定位並修正

先部署專用 Test Function，再推送本輪網站程式，避免新網站呼叫舊版驗證而回 EDGE_UPDATE_REQUIRED。
保持 `--workdir` 明確指定 vault-app，避免 CLI 使用 `C:\Users\User\supabase\config.toml`。

1. iPhone 打開原 PWA，按「重新同步裝置」，展開通知診斷。不要刪 PWA、不清 Cache、不 unregister SW。
2. 看 `VAPID 失敗項目` 及對應 issues：

| failure / issues | 修正方向 |
| --- | --- |
| SUBJECT / INVALID_CONTACT_URI | 在 Supabase Edge Secrets 修改 **現有** VAPID_SUBJECT，例如使用有效 HTTPS 聯絡 URI `https://personal-store-web.vercel.app`。這是 Subject，不需改 APP Origin。 |
| CONTAINS_QUOTES / CONTAINS_WHITESPACE | 私下修正 Secret 原值的多餘引號、空白或 CR/LF；不要貼出 Secret。 |
| INVALID_BASE64URL / INVALID_DECODED_LENGTH / PEM_NOT_SUPPORTED | 找回原配對的 raw Base64URL key，不可直接把 PEM / PKCS8 當 scalar，也不可憑猜測換 key。 |
| P256_POINT_IMPORT_FAILED / P256_PRIVATE_IMPORT_FAILED | 驗證 raw EC key 格式／scalar 或 Runtime crypto import 能力；不要以 env exists 宣稱有效。 |
| PAIR | 各自格式可能正確，但 derived public key 不同；先找回與既有 Public Key 配對的原 Private Key，不要立即生成新 Pair。 |
| VAPID_KEY_MISMATCH | 比對兩端 Public fingerprint，修正實際設定。保留現有 Subscription 所用的正確 Public Key。 |
| LIBRARY | helper 通過，但 web-push 初始化失敗；不回 raw exception，進一步隔離 Runtime API。 |

3. 只有全部 valid、pairMatch=true、公鑰一致、libraryValidation=valid 才測 Test Push。
4. 保留 Provider 400 / 401 / 403 / 404 / 410 / 429 / 5xx 原 status 與既有分類；Provider 401/403 不代表手機權限有問題。
5. 設定失敗時 `pushAttempted=false`。逾時仍是未知，不能假裝沒有送出。
6. Provider 接受後才確認 iPhone 前景、背景、完全未開啟、鎖屏收件；「我已收到」仍是使用者確認，不是自動偵測。
7. 只有這些實機 Test Push 成功後，再處理 Cron。此輪不動 Scheduler。

## 26 項回報

| # | 項目 | 結果 |
| --- | --- | --- |
| 1 | 原錯誤來源 | Test Edge Function 的 `setVapidDetails()` catch；新版分離 `validateVapid()` / `libraryFailure()` |
| 2 | 正式失敗項目 | 舊回應無法區分；新版會回 PUBLIC_KEY / PRIVATE_KEY / SUBJECT / PAIR / IMPORT / LIBRARY，不猜測 |
| 3 | 正式 Public Key 有效 | 待新版 Edge 診斷；已存在不等於有效 |
| 4 | Public decoded 要求 | 65 bytes、0x04、合法 P-256 uncompressed point |
| 5 | 正式 Private Key 有效 | 待新版 Edge 診斷 |
| 6 | Private expected format | 無 padding Base64URL 的 32-byte raw P-256 scalar，常見字串長度 43 |
| 7 | 正式 quote | 待診斷；未讀出 Secret 值 |
| 8 | 正式 whitespace / newline | 待診斷；沒有自動 trim 隱藏問題 |
| 9 | 正式 pair | 待診斷；新增 derive-and-compare，不生成新 Key |
| 10 | Vercel / Edge fingerprint | 新增 SHA-256（只公鑰）；待正式回應。截圖原字串比對已通過，但沒有新 fingerprint 證據 |
| 11 | 正式 Subject | 待診斷；要求合法 HTTPS / mailto 聯絡 URI |
| 12 | Sender implementation | Supabase Deno + npm web-push 3.6.7 |
| 13 | Node / Deno | 隔離的真實 Deno library/JWT/encryption 測試通過；沒有整套重寫 |
| 14 | 重新生成 VAPID | 沒有；尚無現有 Pair 無法修復的證據 |
| 15 | 換 Key 後 repair | 本輪沒換 Key，所以條件未成立；不修改現有 Subscription 流程 |
| 16 | 正式 Server Configured | 截圖為否；待部署與實際 Secret 修正。新版只有全項 valid 才為是 |
| 17 | 正式 Push Attempted | 截圖為否；未自行觸發正式通知 |
| 18 | 真實 HTTP | 使用者截圖 503；新版尚未部署 |
| 19 | 真實 Provider | 尚未呼叫，沒有 Provider response |
| 20 | iPhone 前景 | 尚未驗證成功 |
| 21 | iPhone 背景 | 尚未驗證 |
| 22 | iPhone 未開 | 尚未驗證 |
| 23 | iPhone 鎖屏 | 尚未驗證 |
| 24 | build | npm run build 通過 |
| 25 | lint | 本輪檔案通過；全站仍有既有 89 errors / 50 warnings |
| 26 | typecheck | Next tsc 與 Deno check 皆通過 |

自動回歸：18 個 Node/API/Edge 模擬測試、2 個真實 Deno tests；10 個 Responsive 寬度、明暗模式、fingerprint 換行與格式錯誤 UI 測試通過。
不把模擬 Provider 201 當成真實 Apple Push 或實機收件結果。
