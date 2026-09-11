# 手機 UI 第 5 階段報告（2026-09-11）

## 範圍與狀態

完成原手機 UI 規劃的最後階段：私密保管庫與安全中心手機版介面。
本階段沒有新增 migration、API、Supabase query、subscription 或資料欄位，也沒有修改或刪除任何真實使用者資料。Storage Phase 8 繼續維持暫停。

## 私密保管庫手機版

- 鎖定／首次建立畫面改為緊湊的 App 式安全入口，仍使用原本 Vault 建立與解鎖事件。
- 解鎖狀態、搜尋、分類、批量整理與新增按鈕重新排列，縮短首屏高度。
- 保管項目改為手機單欄安全卡片；敏感內容預設仍遮蔽，顯示、複製、編輯與刪除沿用原事件。
- 分類仍共用 `ResponsiveChipOverflow`，沒有固定切片、第二排或橫向溢出。
- 建立、解鎖、AES-256-GCM 加解密、PBKDF2、Zero-Knowledge payload、10 分鐘自動鎖定及 API 儲存流程完全沒有修改。

## 安全中心手機版

- 新增手機專用安全摘要，使用共用 SVG shield icon 與目前真實頁面內容。
- 「修改密碼」連到現有 `/profile`，「雙因素驗證」連到現有 `/security/mfa`，沒有增加查詢或另一套狀態。
- Passkey、資料夾鎖定、裝置與活動、成人內容權限及危險操作區改為較緊湊的手機卡片層級。
- 成人內容管理功能仍受原本 server-side permissions 條件控制；沒有讓未授權帳號看到額外功能。
- 刪除帳號仍使用原確認 modal 與 DELETE 文字驗證；自動測試只驗證 modal 開啟，沒有提交或呼叫真實刪除 API。

## Responsive、主題與資料請求

- 主要 breakpoint 沿用 `max-width: 700px`，另以 `max-width: 350px` 處理極窄畫面間距。
- 功能樣式放在各功能旁的 CSS Module，沒有塞入 `globals.css`，也沒有使用 `!important`。
- 701px 以上不套用本階段手機規則；桌機與平板使用原有 DOM、state、事件與版面。
- 沿用現有 `--surface`、`--ink`、`--muted`、`--brand`、`--brand-soft`、`--line` 等 theme variables。
- 深色模式、自訂主色、自訂背景、0% 外框透明度、資料密度及字體比例皆沿用現有外觀狀態。
- 支援 `prefers-reduced-motion`；主要按鈕的實際 touch target 至少約 44×44px。
- 修改前後的 API request 清單一致；本階段沒有增加任何 Supabase 或 client API request。

## 驗證

測試使用本機 stub 與瀏覽器 WebCrypto，不連線正式 Supabase。保管庫測試資料只存在隔離測試程序記憶體。

| 寬度 | 結果 |
| --- | --- |
| 320／375／390／430px | 私密保管庫與安全中心無水平溢出，主要 touch target、modal 與真實資料呈現通過 |
| 520／700px | 手機 breakpoint 與既有 cascade 通過 |
| 701／760／768／820px | 修改前後桌機／平板 DOM 幾何尺寸與關鍵 computed layout 完全一致 |
| 1366／1440／1920px | 修改前後桌機 DOM 幾何尺寸與關鍵 computed layout 完全一致 |

另驗證：

- 保管庫測試建立 AES-GCM 加密項目後，卡片預設只顯示遮蔽字元。
- 傳給測試 API 的加密 payload 不含明文 `secret` 欄位。
- 安全中心沒有因手機摘要增加 API request。
- 刪除帳號測試只開啟確認視窗後取消，不執行刪除。
- 深色模式、自訂主色、自訂背景、0% surface opacity、compact 密度與 120% 字體在 320／390／430px 均無水平溢出。
- Chromium 前後截圖仍保留供人工檢查；因同頁重繪可能出現極少量文字反鋸齒像素差，桌機自動門檻使用精確 DOM geometry 與 computed layout 比對，避免把 3 個非版面像素誤判為回歸。
- Targeted ESLint、TypeScript noEmit、git diff check 及 Next.js 16.3.1 production build全部通過。

最終隔離測試輸出：`C:/Users/User/AppData/Local/Temp/vault-mobile-stage5-GUEU1n`

## 修改檔案

### Production：5 個

1. `src/app/(app)/vault/page.tsx`
2. `src/app/(app)/security/page.tsx`
3. `src/components/vault/vault-workspace.tsx`
4. `src/components/vault/vault-mobile.module.css`
5. `src/components/security/security-mobile.module.css`

### 測試：4 個

1. `scripts/tests/mobile-stage5-common-stub.tsx`
2. `scripts/tests/mobile-stage5-data-stubs.ts`
3. `scripts/tests/mobile-stage5-fixture.tsx`
4. `scripts/tests/mobile-stage5-regression.cjs`

### 報告

- `docs/mobile-stage5-report-2026-09-11.md`

原手機 UI 規劃 5 個階段至此全部完成；Storage Phase 8 仍暫停，未包含在本次修改。
