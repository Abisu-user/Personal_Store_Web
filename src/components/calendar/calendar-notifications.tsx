"use client";

import { useEffect, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import styles from "./calendar-mobile.module.css";

type Status = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

function decodeVapidKey(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export function CalendarNotificationSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function inspect() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") { if (!cancelled) setStatus("denied"); return; }
      try {
        const sw = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const ready = await navigator.serviceWorker.ready;
        const subscription = await ready.pushManager.getSubscription();
        const response = await fetch(`/api/calendar/push-subscription${subscription ? `?endpoint=${encodeURIComponent(subscription.endpoint)}` : ""}`, { cache: "no-store" });
        if (!response.ok) throw new Error("無法取得通知設定。");
        const result = await response.json() as { publicKey: string; enabled: boolean };
        if (cancelled) return;
        setRegistration(ready ?? sw);
        setPublicKey(result.publicKey);
        setStatus(!result.publicKey ? "unconfigured" : subscription && result.enabled ? "on" : "off");
      } catch (error) {
        if (!cancelled) { setStatus("off"); setMessage(error instanceof Error ? error.message : "無法取得通知設定。"); }
      }
    }
    void inspect();
    return () => { cancelled = true; };
  }, [open]);

  async function enable() {
    if (!registration || !publicKey || busy) return;
    setBusy(true); setMessage("");
    try {
      // subscribe is called directly from the button gesture, including on iOS Home Screen PWAs.
      const promise = registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) });
      const subscription = await promise;
      const response = await fetch("/api/calendar/push-subscription", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        await subscription.unsubscribe();
        throw new Error((await response.json().catch(() => null))?.error ?? "通知訂閱無法儲存。");
      }
      setStatus("on");
      setMessage("此裝置已開啟行程通知。");
    } catch (error) {
      setStatus(Notification.permission === "denied" ? "denied" : "off");
      setMessage(error instanceof Error ? error.message : "無法開啟行程通知。");
    } finally { setBusy(false); }
  }

  async function disable() {
    if (!registration || busy) return;
    setBusy(true); setMessage("");
    try {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/calendar/push-subscription", {
          method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("無法關閉此裝置的通知。");
        await subscription.unsubscribe();
      }
      setStatus("off"); setMessage("此裝置已關閉行程通知。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "無法關閉行程通知。"); }
    finally { setBusy(false); }
  }

  const unsupportedHint = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !window.matchMedia("(display-mode: standalone)").matches;
  return <ModalDialog className={styles.notificationDialog} eyebrow="CALENDAR REMINDERS" onClose={onClose} open={open} pending={busy} title="行程通知">
    <div className={styles.notificationSettings}>
      <p>行程提醒可在 Personal Store 關閉時送到此裝置。多台裝置可各自開啟或關閉。</p>
      <div className={styles.notificationState}><strong>此裝置</strong><span>{status === "loading" ? "正在檢查…" : status === "on" ? "已開啟" : status === "denied" ? "已封鎖" : status === "unsupported" ? "裝置不支援" : status === "unconfigured" ? "尚未完成伺服器設定" : "未設定"}</span></div>
      {status === "denied" && <p>通知權限已被瀏覽器或系統封鎖，請至裝置通知設定重新開啟。</p>}
      {status === "unsupported" && <p>{unsupportedHint ? "若要接收行程通知，請將 Personal Store 加入主畫面後開啟。" : "目前瀏覽器或裝置不支援 Web Push。"}</p>}
      {status === "unconfigured" && <p>通知伺服器尚未設定 VAPID，行程仍可正常儲存。</p>}
      {message && <p role="status">{message}</p>}
      {status === "off" && <button className="button" disabled={busy || !registration || !publicKey} onClick={enable} type="button">{busy ? "正在開啟通知…" : "開啟行程通知"}</button>}
      {status === "on" && <button className="secondary-button" disabled={busy} onClick={disable} type="button">{busy ? "正在關閉…" : "關閉此裝置通知"}</button>}
      <button className="secondary-button" disabled={busy} onClick={onClose} type="button">稍後再說</button>
    </div>
  </ModalDialog>;
}
