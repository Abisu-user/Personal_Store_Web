"use client";

import { FormEvent, useEffect, useState } from "react";

import { lockSettingKey, pinStatusEvent } from "@/components/security/app-lock-provider";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { createClient } from "@/lib/supabase/client";

type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
type PinMode = "pin4" | "pin6";
const delays = [["immediate", "立即"], ["30", "30 秒"], ["60", "1 分鐘"], ["300", "5 分鐘"], ["900", "15 分鐘"]] as const;

export function PasskeySettings() {
  const [delay, setDelay] = useState("immediate");
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [pinMode, setPinMode] = useState<PinMode>("pin4");
  const [pinConfigured, setPinConfigured] = useState(false);
  const [autoLockEnabled, setAutoLockEnabled] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const delayTimer = window.setTimeout(() => setDelay(window.localStorage.getItem(lockSettingKey) ?? "immediate"), 0);
    void load();
    return () => window.clearTimeout(delayTimer);
  }, []);

  async function load() {
    const [{ data }, pinResponse] = await Promise.all([createClient().auth.passkey.list(), fetch("/api/security/app-lock", { cache: "no-store" })]);
    setKeys((data ?? []) as Passkey[]);
    if (pinResponse.ok) {
      const status = await pinResponse.json() as { configured: boolean; mode: PinMode | null; autoLockEnabled: boolean };
      setPinConfigured(status.configured);
      setAutoLockEnabled(status.autoLockEnabled);
      if (status.mode) setPinMode(status.mode);
    }
  }

  function changeDelay(value: string) {
    window.localStorage.setItem(lockSettingKey, value);
    setDelay(value);
  }

  async function enableAutoLock() {
    setPending(true); setMessage(null);
    const response = await fetch("/api/security/app-lock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", enabled: true }) });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) { setMessage(data.error ?? "無法開啟自動鎖定。"); return; }
    setAutoLockEnabled(true); window.dispatchEvent(new Event(pinStatusEvent)); setMessage("App 自動鎖定已開啟。");
  }

  async function disableAutoLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pin = String(new FormData(event.currentTarget).get("pin") ?? "");
    setPending(true); setMessage(null); setDisableError(null);
    const response = await fetch("/api/security/app-lock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", enabled: false, pin }) });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) { setDisableError(data.error ?? "PIN 驗證失敗，未變更自動鎖定設定。"); return; }
    setAutoLockEnabled(false); setDisableOpen(false); window.dispatchEvent(new Event(pinStatusEvent)); setMessage("App 自動鎖定已關閉。");
  }

  async function savePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget); const pin = String(form.get("pin") ?? ""); const confirm = String(form.get("confirm") ?? "");
    const length = pinMode === "pin4" ? 4 : 6;
    if (!new RegExp(`^\\d{${length}}$`).test(pin)) { setMessage(`請輸入 ${length} 位數 PIN。`); return; }
    if (pin !== confirm) { setMessage("兩次輸入的 PIN 不一致。"); return; }
    setPending(true); setMessage(null);
    const response = await fetch("/api/security/app-lock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "configure", mode: pinMode, pin }) });
    const data = await response.json().catch(() => ({})); setPending(false);
    if (!response.ok) { setMessage(data.error ?? "無法儲存 App PIN。"); return; }
    event.currentTarget.reset(); setPinConfigured(true); window.dispatchEvent(new Event(pinStatusEvent)); setMessage("App PIN 已儲存，之後自動鎖定可直接使用此 PIN 解鎖。");
  }

  async function register() {
    setPending(true); setMessage(null); const { error } = await createClient().auth.registerPasskey(); setPending(false);
    if (error) { setMessage(error.code === "passkey_disabled" ? "請先在 Supabase Authentication → Passkeys 啟用 Passkey，並設定 personal-store-web.vercel.app 為 Relying Party Origin。" : "無法啟用 Face ID / Passkey；請確認裝置支援後再試一次。"); return; }
    setMessage("Face ID / Passkey 已啟用。"); await load();
  }

  async function remove(id: string) {
    setPending(true); const { error } = await createClient().auth.passkey.delete({ passkeyId: id }); setPending(false); setMessage(error ? "無法移除 Passkey。" : "Passkey 已移除。"); await load();
  }

  return <section className="passkey-settings">
    <div className="passkey-heading"><div><p className="eyebrow">APP LOCK</p><h2>App 自動鎖定</h2><p>新帳號預設關閉；開啟後，App 進入背景超過指定時間會鎖定畫面。</p></div><button aria-pressed={autoLockEnabled} className={autoLockEnabled ? "secondary-button compact" : "button compact"} disabled={pending} onClick={() => { if (autoLockEnabled) { setDisableError(null); setDisableOpen(true); } else { void enableAutoLock(); } }} type="button">{autoLockEnabled ? "關閉自動鎖定" : "開啟自動鎖定"}</button></div>
    {autoLockEnabled && <label>進入背景後鎖定<select onChange={(event) => changeDelay(event.target.value)} value={delay}>{delays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    <form className="app-pin-settings" onSubmit={savePin}><div><p className="eyebrow">QUICK PIN</p><h2>{pinConfigured ? "更新 App PIN" : "設定 App PIN"}</h2><p>可選 4 或 6 位數字；PIN 僅在伺服器端驗證，不會保存或傳回明文。</p></div><label>PIN 類型<select disabled={pending} onChange={(event) => setPinMode(event.target.value as PinMode)} value={pinMode}><option value="pin4">4 位數 PIN</option><option value="pin6">6 位數 PIN</option></select></label><div className="app-pin-fields"><label>輸入 PIN<input autoComplete="new-password" inputMode="numeric" maxLength={pinMode === "pin4" ? 4 : 6} name="pin" pattern="[0-9]*" required type="password" /></label><label>再次輸入<input autoComplete="new-password" inputMode="numeric" maxLength={pinMode === "pin4" ? 4 : 6} name="confirm" pattern="[0-9]*" required type="password" /></label></div><button className="button compact" disabled={pending} type="submit">{pending ? "儲存中…" : pinConfigured ? "更新 App PIN" : "儲存 App PIN"}</button></form>
    <div className="passkey-heading"><div><p className="eyebrow">FACE ID / PASSKEY</p><h2>快速解鎖</h2><p>支援的 iPhone 會由系統使用 Face ID、Touch ID 或裝置密碼完成驗證。</p></div><button className="button compact" disabled={pending} onClick={() => void register()} type="button">{pending ? "處理中…" : "啟用 Face ID / Passkey"}</button></div>
    {message && <p className="notice" role="status">{message}</p>}
    {keys.length > 0 && <div className="passkey-list">{keys.map((key) => <div key={key.id}><span><strong>{key.friendly_name || "此裝置 Passkey"}</strong><small>已設定</small></span><button className="delete-button compact" disabled={pending} onClick={() => void remove(key.id)} type="button">移除</button></div>)}</div>}
    <ModalDialog onClose={() => { if (!pending) { setDisableError(null); setDisableOpen(false); } }} open={disableOpen} pending={pending} title="關閉 App 自動鎖定"><form className="app-lock-disable-form" onSubmit={disableAutoLock}><p>為了確認是本人操作，請重新輸入目前的 App PIN。PIN 不正確時設定不會變更。</p>{!pinConfigured && <p className="notice error">此帳號尚未設定 App PIN，請先返回設定 PIN。</p>}{disableError && <p className="notice error" role="alert">{disableError}</p>}<label>目前的 App PIN<input autoComplete="current-password" autoFocus disabled={!pinConfigured || pending} inputMode="numeric" maxLength={pinMode === "pin4" ? 4 : 6} name="pin" pattern="[0-9]*" required type="password" /></label><div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={() => { setDisableError(null); setDisableOpen(false); }} type="button">取消</button><button className="delete-button" disabled={!pinConfigured || pending} type="submit">{pending ? "驗證中…" : "確認關閉"}</button></div></form></ModalDialog>
  </section>;
}
