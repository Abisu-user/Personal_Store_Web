"use client";

import { useEffect, useState } from "react";
import { lockSettingKey } from "@/components/security/app-lock-provider";
import { createClient } from "@/lib/supabase/client";

type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
const delays = [["immediate", "立即"], ["30", "30 秒"], ["60", "1 分鐘"], ["300", "5 分鐘"], ["900", "15 分鐘"]] as const;

export function PasskeySettings() {
  const [delay, setDelay] = useState("immediate");
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setDelay(window.localStorage.getItem(lockSettingKey) ?? "immediate"); void load(); }, []);
  async function load() { const { data } = await createClient().auth.passkey.list(); setKeys((data ?? []) as Passkey[]); }
  function changeDelay(value: string) { window.localStorage.setItem(lockSettingKey, value); setDelay(value); }
  async function register() { setPending(true); setMessage(null); const { error } = await createClient().auth.registerPasskey(); setPending(false); if (error) { setMessage(error.code === "passkey_disabled" ? "請先在 Supabase Authentication → Passkeys 啟用 Passkey，並設定 personal-store-web.vercel.app 為 Relying Party Origin。" : "無法啟用 Face ID / Passkey；請確認裝置支援後再試一次。"); return; } setMessage("Face ID / Passkey 已啟用。"); await load(); }
  async function remove(id: string) { setPending(true); const { error } = await createClient().auth.passkey.delete({ passkeyId: id }); setPending(false); setMessage(error ? "無法移除 Passkey。" : "Passkey 已移除。"); await load(); }
  return <section className="passkey-settings"><div><p className="eyebrow">APP LOCK</p><h2>App 自動鎖定</h2><p>登入 Session 會保留；進入背景時只鎖定畫面，回來後需驗證身分。</p></div><label>進入背景後鎖定<select onChange={(event) => changeDelay(event.target.value)} value={delay}>{delays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="passkey-heading"><div><p className="eyebrow">FACE ID / PASSKEY</p><h2>快速解鎖</h2><p>支援的 iPhone 會由系統使用 Face ID、Touch ID 或裝置密碼完成驗證。</p></div><button className="button compact" disabled={pending} onClick={() => void register()} type="button">{pending ? "處理中…" : "啟用 Face ID / Passkey"}</button></div>{message && <p className="notice" role="status">{message}</p>}{keys.length > 0 && <div className="passkey-list">{keys.map((key) => <div key={key.id}><span><strong>{key.friendly_name || "此裝置 Passkey"}</strong><small>已設定</small></span><button className="delete-button compact" disabled={pending} onClick={() => void remove(key.id)} type="button">移除</button></div>)}</div>}</section>;
}
