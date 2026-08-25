"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AdultAccessMode, AnimePreferences } from "@/lib/anime/types";

const defaults: AnimePreferences = { adultModeEnabled: false, adultHiddenByDefault: true, adultAccessMode: "none", blurAdultCovers: true };
const pinModes = new Set<AdultAccessMode>(["pin4", "pin6"]);

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "操作失敗，請稍後再試。");
  return payload as T;
}

export function AdultContentSettings() {
  const [preferences, setPreferences] = useState<AnimePreferences>(defaults);
  const [pinConfigured, setPinConfigured] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void (async () => {
    try {
      const [next, pin] = await Promise.all([request<AnimePreferences>("/api/anime/preferences"), request<{ configured: boolean }>("/api/anime/preferences/pin")]);
      setPreferences(next); setPinConfigured(pin.configured);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "無法讀取成人內容設定。"); }
  })(); }, []);

  async function save(changes: Partial<AnimePreferences>) {
    setPending(true); setMessage(null);
    try { const next = await request<AnimePreferences>("/api/anime/preferences", { method: "PATCH", body: JSON.stringify(changes) }); setPreferences(next); setMessage("成人內容設定已儲存。"); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "無法儲存成人內容設定。"); }
    finally { setPending(false); }
  }

  async function setAccessMode(mode: AdultAccessMode) {
    if (pinModes.has(mode) && !pinConfigured) { setMessage("請先在下方設定獨立的成人區 PIN，再選擇此驗證方式。"); return; }
    await save({ adultAccessMode: mode });
  }

  async function savePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const mode = String(form.get("mode")) as "pin4" | "pin6";
    const pin = String(form.get("pin") ?? ""); const confirm = String(form.get("confirm") ?? "");
    const digits = mode === "pin4" ? 4 : 6;
    if (!new RegExp(`^\\d{${digits}}$`).test(pin)) { setMessage(`請輸入 ${digits} 位數字 PIN。`); return; }
    if (pin !== confirm) { setMessage("兩次輸入的 PIN 不一致。"); return; }
    setPending(true); setMessage(null);
    try {
      await request("/api/anime/preferences/pin", { method: "POST", body: JSON.stringify({ action: "configure", mode, pin }) });
      const next = await request<AnimePreferences>("/api/anime/preferences", { method: "PATCH", body: JSON.stringify({ adultAccessMode: mode }) });
      setPreferences(next); setPinConfigured(true); event.currentTarget.reset(); setMessage("成人區 PIN 已儲存；它與登入密碼、App PIN 完全不同。");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "無法儲存成人區 PIN。"); }
    finally { setPending(false); }
  }

  return <section className="passkey-settings adult-security-settings">
    <div><p className="eyebrow">ADULT CONTENT</p><h2>成人內容保護</h2><p>成人作品獨立於一般動漫庫。設定與開啟此區需要既有 Vault 解鎖，作品不會出現在首頁、最近使用或一般探索。</p></div>
    <label className="setting-check"><input checked={preferences.adultModeEnabled} disabled={pending} onChange={(event) => void save({ adultModeEnabled: event.target.checked })} type="checkbox" /><span>啟用 18+ 成人內容模式</span></label>
    <label className="setting-check"><input checked={preferences.blurAdultCovers} disabled={!preferences.adultModeEnabled || pending} onChange={(event) => void save({ blurAdultCovers: event.target.checked })} type="checkbox" /><span>成人封面預設模糊</span></label>
    <label>開啟成人區時驗證<select disabled={!preferences.adultModeEnabled || pending} onChange={(event) => void setAccessMode(event.target.value as AdultAccessMode)} value={preferences.adultAccessMode}><option value="none">不額外要求（仍受 Vault 鎖定保護）</option><option value="passkey">Face ID / Passkey</option><option value="pin4">獨立 4 位數 PIN</option><option value="pin6">獨立 6 位數 PIN</option></select></label>
    <form className="app-pin-settings" onSubmit={savePin}>
      <div><p className="eyebrow">ADULT AREA PIN</p><h2>{pinConfigured ? "更新成人區 PIN" : "設定成人區 PIN"}</h2><p>這是獨立的成人區密碼，僅格式與 App PIN 相同；不會使用你的登入密碼或 App PIN。</p></div>
      <label>PIN 類型<select defaultValue={preferences.adultAccessMode === "pin6" ? "pin6" : "pin4"} disabled={!preferences.adultModeEnabled || pending} name="mode"><option value="pin4">4 位數 PIN</option><option value="pin6">6 位數 PIN</option></select></label>
      <div className="app-pin-fields"><label>輸入 PIN<input autoComplete="new-password" disabled={!preferences.adultModeEnabled || pending} inputMode="numeric" maxLength={6} name="pin" pattern="[0-9]*" required type="password" /></label><label>再次輸入<input autoComplete="new-password" disabled={!preferences.adultModeEnabled || pending} inputMode="numeric" maxLength={6} name="confirm" pattern="[0-9]*" required type="password" /></label></div>
      <button className="button compact" disabled={!preferences.adultModeEnabled || pending} type="submit">{pending ? "儲存中…" : pinConfigured ? "更新成人區 PIN" : "儲存成人區 PIN"}</button>
    </form>
    <p className="anime-field-hint">切換 App、鎖定螢幕或進入背景時，成人區會立即隱藏；多工預覽由 Vault 鎖定遮罩保護。</p>
    {message && <p className="notice" role="status">{message}</p>}
  </section>;
}
