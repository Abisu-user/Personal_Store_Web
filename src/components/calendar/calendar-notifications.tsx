"use client";

import { useEffect, useRef, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { decodeVapidKey, maskSubscriptionId, notificationEnabled, notificationRegistered, subscriptionKeyMatches, type PushDiagnostics, type PushTestOutcome, type VapidValidationDiagnostics } from "@/lib/calendar/push-diagnostics";
import { inspectPushDevice, setDeviceOptOut, syncPushSubscription } from "@/lib/calendar/push-device";
import { readPushTestHistory, writePushTestHistory, type PushTestHistory } from "@/lib/calendar/push-test-history";
import styles from "./calendar-mobile.module.css";

type TestResult = { ok: boolean; code: string; providerStatus?: number; acceptedAt?: string; httpStatus: number; serverBuild?: string; vapidValidation?: VapidValidationDiagnostics } & Partial<PushTestOutcome>;
const flagLabel = (value: boolean | null | undefined) => value === true ? "是" : value === false ? "否" : "未確認";
const testErrors: Record<string, string> = {
  SERVER_NOT_CONFIGURED: "Web Push 伺服器尚未設定完成。",
  EDGE_NOT_CONFIGURED: "Edge Function 的 VAPID 設定不完整。",
  EDGE_UPDATE_REQUIRED: "請部署新版 send-calendar-test-push Function。",
  DISPATCH_UNAUTHORIZED: "網站與 Edge 的派送密鑰不一致。",
  DISPATCH_UNREACHABLE: "無法連線到推播伺服器，請稍後重新測試。",
  VAPID_CONFIG_INVALID: "Edge 的 VAPID 驗證未通過，請查看診斷中的失敗項目。",
  VAPID_KEY_MISMATCH: "網站與 Edge 使用不同 VAPID 公鑰。",
  VAPID_REJECTED: "推播服務拒絕 VAPID 驗證，請檢查固定金鑰組。",
  SUBSCRIPTION_EXPIRED: "此裝置訂閱已失效，請先清除舊訂閱，再按修復通知建立新訂閱。",
  SUBSCRIPTION_NOT_REGISTERED: "此裝置尚未登記，請重新同步。",
  TEST_RATE_LIMITED: "測試太頻繁，請等待 15 秒再試。",
  PROVIDER_RATE_LIMITED: "推播服務暫時限制請求，請稍後再試。",
};

export function CalendarNotificationSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [busy, setBusy] = useState(false);
  const [inspecting, setInspecting] = useState(true);
  const [message, setMessage] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [history, setHistory] = useState<(PushTestHistory & { accountId: string; subscriptionId: string }) | null>(null);
  const operation = useRef(false);
  const inspection = useRef<Promise<Awaited<ReturnType<typeof inspectPushDevice>>> | null>(null);

  function restoreHistory(value: PushDiagnostics) {
    const accountId = value.config?.accountId, subscriptionId = value.server?.id;
    const saved = accountId && subscriptionId ? readPushTestHistory(accountId, subscriptionId) : null;
    setHistory(saved && accountId && subscriptionId ? { ...saved, accountId, subscriptionId } : null);
    setTestResult(null);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) setInspecting(true); });
    // Share Strict Mode's duplicate inspection. No automatic permission prompt.
    inspection.current ??= inspectPushDevice();
    const pending = inspection.current;
    void pending.then((result) => {
      if (!cancelled) { setDiagnostics(result.diagnostics); setRegistration(result.registration); restoreHistory(result.diagnostics); setInspecting(false); }
    }).finally(() => { if (inspection.current === pending) inspection.current = null; });
    return () => { cancelled = true; };
  }, [open]);

  function saveHistory(value: PushTestHistory) {
    const accountId = diagnostics?.config?.accountId, subscriptionId = diagnostics?.server?.id;
    if (!accountId || !subscriptionId) return;
    writePushTestHistory(accountId, subscriptionId, value);
    setHistory({ ...value, accountId, subscriptionId });
  }

  async function refresh() {
    if (operation.current) return;
    operation.current = true; setBusy(true); setMessage("正在同步裝置…");
    try {
      const result = await inspectPushDevice();
      setDiagnostics(result.diagnostics); setRegistration(result.registration); restoreHistory(result.diagnostics);
      setMessage(result.diagnostics.error ?? (notificationEnabled(result.diagnostics) ? "此裝置訂閱已同步。請發送測試通知確認實際接收。" : "尚未完成設定，請查看診斷詳情。"));
    } finally { operation.current = false; setBusy(false); }
  }

  async function enable() {
    if (!registration || !diagnostics?.config?.publicKey || operation.current) return;
    operation.current = true; setBusy(true); setMessage("");
    let current = diagnostics;
    try {
      if (Notification.permission === "denied") throw new Error("通知已被系統封鎖，請至系統設定調整。");
      if (!diagnostics.workerActive) throw new Error("Service Worker 尚未正常啟動，請重新同步裝置。");
      // Called directly in the gesture; permission is requested by the browser only if default.
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(diagnostics.config.publicKey) });
      current = { ...diagnostics, permission: Notification.permission, subscriptionExists: true,
        keyMatches: subscriptionKeyMatches(subscription, diagnostics.config.publicKey) };
      setDiagnostics(current);
      if (!current.keyMatches) throw new Error("此訂閱使用不同 VAPID 公鑰，請先清除舊訂閱再重新開啟。");
      // Temporary DB failure must not destroy the browser subscription.
      const server = await syncPushSubscription(subscription);
      setDeviceOptOut(diagnostics.config.accountId, false);
      setDiagnostics({ ...current, server, error: null });
      setMessage("此裝置已完成訂閱登記。請發送測試通知，確認手機是否收到。");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "通知設定失敗。";
      setDiagnostics({ ...current, permission: Notification.permission, error: errorMessage });
      setMessage(errorMessage);
    } finally { operation.current = false; setBusy(false); }
  }

  async function disable() {
    if (!registration || !diagnostics?.config || operation.current) return;
    operation.current = true; setBusy(true); setMessage("");
    try {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/calendar/push-subscription", { method: "DELETE", signal: AbortSignal.timeout(15_000),
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error("無法關閉伺服器訂閱，請重試。");
        setDeviceOptOut(diagnostics.config.accountId, true);
        // Reflect the confirmed server disable even if the browser's unsubscribe then throws.
        setDiagnostics({ ...diagnostics, server: diagnostics.server ? { ...diagnostics.server, enabled: false } : null, error: null });
        const removed = await subscription.unsubscribe();
        setDiagnostics({ ...diagnostics, subscriptionExists: !removed, server: diagnostics.server ? { ...diagnostics.server, enabled: false } : null });
        setMessage(removed ? "此裝置通知已關閉。" : "伺服器通知已關閉；裝置訂閱尚未移除，可再按一次關閉。");
      } else {
        setDeviceOptOut(diagnostics.config.accountId, true);
        setDiagnostics({ ...diagnostics, subscriptionExists: false, server: null });
        setMessage("此裝置通知已關閉。");
      }
    } catch { setMessage("關閉未完成，請重新同步並重試。"); }
    finally { operation.current = false; setBusy(false); }
  }

  async function sendTest() {
    if (!diagnostics?.server?.id || operation.current) return;
    operation.current = true; setBusy(true); setMessage("正在發送真正的伺服器測試通知…");
    try {
      const response = await fetch("/api/calendar/test-push", { method: "POST", signal: AbortSignal.timeout(20_000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId: diagnostics.server.id }) });
      const body = await response.json().catch(() => ({}));
      const result: TestResult = { ok: response.ok && body.ok === true, code: typeof body.code === "string" ? body.code : "HTTP_ERROR",
        httpStatus: response.status, providerStatus: body.pushProviderStatus ?? body.providerStatus, acceptedAt: body.acceptedAt,
        serverConfigured: body.serverConfigured, subscriptionFound: body.subscriptionFound, pushAttempted: body.pushAttempted,
        invalidSubscription: body.invalidSubscription, serverBuild: body.serverBuild, vapidValidation: body.vapidValidation };
      setTestResult(result);
      if (result.ok && result.code === "PUSH_ACCEPTED" && result.acceptedAt) {
        saveHistory({ acceptedAt: result.acceptedAt, last_confirmed_received_at: null });
      }
      setMessage(result.ok ? "伺服器已送出測試通知；請確認此裝置是否實際收到。此結果不代表手機已顯示通知。" :
        "測試通知發送失敗。" + (testErrors[result.code] ?? "請查看診斷詳情。"));
      if (result.code === "SUBSCRIPTION_EXPIRED" || result.code === "SUBSCRIPTION_NOT_REGISTERED") {
        setDiagnostics({ ...diagnostics, server: { ...diagnostics.server, enabled: false } });
      }
    } catch {
      setTestResult({ ok: false, code: "NETWORK_OR_TIMEOUT", httpStatus: 0 });
      setMessage("測試請求逾時或網路中斷；送出結果未知，請先確認手機是否收到，避免重複測試。");
    } finally { operation.current = false; setBusy(false); }
  }

  const enabled = diagnostics ? notificationEnabled(diagnostics) : false;
  const registered = diagnostics ? notificationRegistered(diagnostics) : false;
  const requiresReset = Boolean(diagnostics?.subscriptionExists && (!diagnostics.keyMatches || diagnostics.server?.enabled === false));
  const unsupported = diagnostics?.supported === false;
  const denied = diagnostics?.permission === "denied";
  const title = inspecting || !diagnostics ? "正在檢查…" : unsupported ? "裝置不支援" : denied ? "已被系統封鎖" :
    enabled ? "已開啟" : registered && !diagnostics.error ? "伺服器待完成設定" : !diagnostics.config?.publicKey ? "尚未完成伺服器設定" : "通知尚未完成設定";
  const productionMismatch = diagnostics?.config?.productionOrigin && typeof location !== "undefined" && location.origin !== diagnostics.config.productionOrigin;
  const deviceHistory = history?.accountId === diagnostics?.config?.accountId && history?.subscriptionId === diagnostics?.server?.id ? history : null;
  const vapid = testResult?.vapidValidation ?? diagnostics?.config?.vapidValidation;

  return <ModalDialog className={styles.notificationDialog} eyebrow="CALENDAR REMINDERS" onClose={onClose} open={open} pending={busy} title="行程通知">
    <div className={styles.notificationSettings}>
      <p>通知由伺服器發送，不依賴日曆頁面保持開啟。各裝置需分別登記。</p>
      <div className={styles.notificationState}><strong>此裝置</strong><span>{title}</span></div>
      {unsupported && <p>目前環境不支援 Web Push。iPhone 請從「加入主畫面」的 Personal Store 開啟，並確認 iOS 支援通知。</p>}
      {denied && <p>請至裝置的通知設定開啟權限；網站不會重複要求授權。</p>}
      {productionMismatch && <p>目前網址與設定的正式網址不同。不同網域不能沿用通知訂閱，請固定使用正式網址測試。</p>}
      {diagnostics?.config && diagnostics.config.dispatcher !== "ready" && <p>{testErrors[diagnostics.config.dispatcherCode ?? ""] ?? "推播伺服器尚未完成連線檢查。"}</p>}
      {diagnostics?.error && <p role="alert">{diagnostics.error}</p>}
      {message && <p role="status" aria-live="polite">{message}</p>}
      <div className={styles.notificationActions}>
        {!registered && !requiresReset && !denied && !unsupported && <button className="button" disabled={busy || inspecting || !registration || !diagnostics?.config?.publicKey} onClick={enable} type="button">
          {diagnostics?.permission === "granted" ? "修復通知" : "開啟行程通知"}</button>}
        {registered && <button className="button" disabled={busy || inspecting} onClick={sendTest} type="button">發送測試通知</button>}
        {!unsupported && <button className="secondary-button" disabled={busy || inspecting || !diagnostics} onClick={refresh} type="button">重新同步裝置</button>}
        {diagnostics?.subscriptionExists && <button className="secondary-button" disabled={busy || inspecting} onClick={disable} type="button">{requiresReset ? "清除舊訂閱" : "關閉此裝置通知"}</button>}
      </div>
      <details className={styles.notificationDetails}>
        <summary>通知診斷詳情</summary>
        <dl>
          <div><dt>系統通知權限</dt><dd>{diagnostics?.permission ?? "檢查中"}</dd></div>
          <div><dt>Service Worker</dt><dd>{diagnostics?.workerActive ? "正常 / active" : "未啟動"}</dd></div>
          <div><dt>Scope</dt><dd>{diagnostics?.workerScope ?? "—"}</dd></div>
          <div><dt>Push Subscription</dt><dd>{diagnostics?.subscriptionExists ? "已建立" : "未建立"}</dd></div>
          <div><dt>訂閱公鑰一致</dt><dd>{diagnostics?.keyMatches ? "是" : "未確認"}</dd></div>
          <div><dt>伺服器登記</dt><dd>{diagnostics?.server?.enabled ? "已登記" : "未完成 / 已停用"}</dd></div>
          <div><dt>訂閱 ID（遮蔽）</dt><dd>{maskSubscriptionId(diagnostics?.server?.id)}</dd></div>
          <div><dt>最近同步</dt><dd>{diagnostics?.server?.lastSyncedAt ? new Date(diagnostics.server.lastSyncedAt).toLocaleString("zh-TW") : "—"}</dd></div>
          <div><dt>Web Push 伺服器</dt><dd>{diagnostics?.config?.dispatcher === "ready" ? "公鑰一致；接收仍需實測" : diagnostics?.config?.dispatcherCode ?? "未確認"}</dd></div>
          {Object.entries(diagnostics?.config?.configuration?.vercel ?? {}).map(([name, status]) => <div key={name}><dt>Vercel · {name}</dt><dd>{status}</dd></div>)}
          {diagnostics?.config?.configuration?.edge ? Object.entries(diagnostics.config.configuration.edge).map(([name, status]) =>
            <div key={name}><dt>Supabase Edge · {name}</dt><dd>{status}</dd></div>) : <div><dt>Supabase Edge 設定</dt><dd>未確認，需先連通網站派送端</dd></div>}
          {vapid && <>
            {(["publicKey", "privateKey", "subject"] as const).map((key) => {
              const value = vapid[key], label = key === "publicKey" ? "Public Key" : key === "privateKey" ? "Private Key" : "Subject";
              const keyValue = key !== "subject" ? vapid[key] : null;
              return <div key={key}><dt>VAPID · {label}</dt><dd>
                {value.exists ? "configured" : "missing"} · {value.formatValid ? "valid" : "INVALID FORMAT"}<br />
                長度 {value.length}{keyValue && <> · 解碼 {keyValue.decodedLength ?? "—"} bytes · Base64URL {keyValue.base64urlValid ? "valid" : "invalid"}</>}<br />
                引號 / 空白 / 換行：{flagLabel(value.containsQuotes)} / {flagLabel(value.containsWhitespace)} / {flagLabel(value.containsNewline)}<br />
                前 / 後空白：{flagLabel(value.leadingWhitespace)} / {flagLabel(value.trailingWhitespace)}
                {value.issues.length > 0 && <><br />{value.issues.join(" · ")}</>}
              </dd></div>;
            })}
            <div><dt>VAPID Key Pair</dt><dd>{flagLabel(vapid.pairMatch)}</dd></div>
            <div><dt>Vercel / Edge 公鑰一致</dt><dd>{flagLabel(vapid.publicKeyMatch)}</dd></div>
            <div><dt>Vercel Public SHA-256</dt><dd>{vapid.fingerprints.expectedPublic ?? "未取得"}</dd></div>
            <div><dt>Edge Public SHA-256</dt><dd>{vapid.fingerprints.edgePublic ?? "未取得"}</dd></div>
            <div><dt>Library Validation</dt><dd>{vapid.libraryValidation}</dd></div>
            <div><dt>VAPID 失敗項目</dt><dd>{vapid.failure ?? "無"}</dd></div>
          </>}
          <div><dt>此裝置最後測試送出</dt><dd>{deviceHistory ? `${new Date(deviceHistory.acceptedAt).toLocaleString("zh-TW")} · Provider 已接受` : "尚無成功送出紀錄"}</dd></div>
          <div><dt>手機實際接收</dt><dd>{deviceHistory?.last_confirmed_received_at ? `${new Date(deviceHistory.last_confirmed_received_at).toLocaleString("zh-TW")} · 使用者確認` : "需由裝置確認，無法以 HTTP 成功判定"}</dd></div>
          <div><dt>頁面 / 伺服器 Build</dt><dd>{process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown"} / {diagnostics?.config?.buildId ?? "—"}</dd></div>
          <div><dt>Worker 版本</dt><dd>{diagnostics?.workerVersion ?? "未取得"}</dd></div>
          <div><dt>目前 Origin</dt><dd>{typeof location === "undefined" ? "—" : location.origin}</dd></div>
          <div><dt>正式 Origin</dt><dd>{diagnostics?.config?.productionOrigin ?? "伺服器尚未設定"}</dd></div>
          {testResult && <><div><dt>測試 HTTP / Provider</dt><dd>{testResult.httpStatus || "無回應"} / {testResult.providerStatus ?? "—"}</dd></div>
            <div><dt>測試代碼</dt><dd>{testResult.code}</dd></div>
            <div><dt>Server 已設定 / 找到訂閱</dt><dd>{flagLabel(testResult.serverConfigured)} / {flagLabel(testResult.subscriptionFound)}</dd></div>
            <div><dt>已嘗試 Push / 訂閱失效</dt><dd>{flagLabel(testResult.pushAttempted)} / {flagLabel(testResult.invalidSubscription)}</dd></div>
            <div><dt>測試 Server Build</dt><dd>{testResult.serverBuild ?? "—"}</dd></div></>}
        </dl>
        {deviceHistory && !deviceHistory.last_confirmed_received_at && <button className="secondary-button" disabled={busy}
          onClick={() => saveHistory({ acceptedAt: deviceHistory.acceptedAt, last_confirmed_received_at: new Date().toISOString() })} type="button">我已收到</button>}
        <p>測試紀錄只保留在此裝置、此帳號與此訂閱；「我已收到」是使用者確認，不是伺服器自動偵測。</p>
      </details>
      <button className="secondary-button" disabled={busy} onClick={onClose} type="button">完成</button>
    </div>
  </ModalDialog>;
}
