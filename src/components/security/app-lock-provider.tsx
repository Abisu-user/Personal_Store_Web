"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LockDelay = "immediate" | "30" | "60" | "300" | "900";

const lockDelayMs: Record<LockDelay, number> = { immediate: 0, "30": 30_000, "60": 60_000, "300": 300_000, "900": 900_000 };
const lockSettingKey = "personal-vault:app-lock-delay:v1";

function readDelay(): LockDelay {
  const value = window.localStorage.getItem(lockSettingKey);
  return value === "30" || value === "60" || value === "300" || value === "900" ? value : "immediate";
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(true);
  const [pending, setPending] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const backgroundAt = useRef<number | null>(null);
  const timer = useRef<number | null>(null);

  const lock = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    document.documentElement.dataset.vaultLocked = "true";
    setLocked(true);
    setPasswordMode(false);
  }, []);
  const unlock = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    document.documentElement.dataset.vaultLocked = "false";
    setError(null);
    setPasswordMode(false);
    setLocked(false);
  }, []);

  useEffect(() => {
    const justAuthenticated = window.sessionStorage.getItem("personal-vault:unlock-after-login") === "1";
    if (justAuthenticated) {
      window.sessionStorage.removeItem("personal-vault:unlock-after-login");
      unlock();
    } else {
      lock();
    }
    void createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        backgroundAt.current = Date.now();
        const delay = readDelay();
        if (delay === "immediate") lock();
        else timer.current = window.setTimeout(lock, lockDelayMs[delay]);
        return;
      }
      const delay = readDelay();
      if (backgroundAt.current && Date.now() - backgroundAt.current >= lockDelayMs[delay]) lock();
      backgroundAt.current = null;
    };
    const onPageHide = () => lock();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [lock, unlock]);

  async function unlockWithPasskey() {
    setPending(true); setError(null);
    const { error: passkeyError } = await createClient().auth.signInWithPasskey();
    setPending(false);
    if (passkeyError) {
      setError(passkeyError.code === "passkey_disabled" ? "Face ID / Passkey 尚未在安全設定啟用。你仍可使用密碼解鎖。" : "無法完成 Face ID / Passkey 驗證，請再試一次或使用密碼。");
      return;
    }
    unlock();
  }

  async function unlockWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) { setError("目前工作階段無法確認帳號，請使用一般登入。 "); return; }
    setPending(true); setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const { error: passwordError } = await createClient().auth.signInWithPassword({ email, password });
    setPending(false);
    if (passwordError) { setError("密碼不正確，請再試一次。"); return; }
    unlock();
  }

  return <>{children}{locked && <div aria-live="polite" className="app-lock-overlay" role="dialog" aria-modal="true"><section className="app-lock-card"><img alt="" src="/icon.svg" /><p className="eyebrow">PERSONAL VAULT</p><h1>Vault 已鎖定</h1><p>需要驗證身分才能繼續；你的資料不會顯示在鎖定畫面中。</p>{error && <p className="notice error" role="alert">{error}</p>}{passwordMode ? <form className="form" onSubmit={unlockWithPassword}><label className="field" htmlFor="app-lock-password">使用密碼解鎖<input autoComplete="current-password" id="app-lock-password" minLength={10} name="password" required type="password" /></label><button className="button" disabled={pending} type="submit">{pending ? "驗證中…" : "使用密碼解鎖"}</button><button className="secondary-button" disabled={pending} onClick={() => setPasswordMode(false)} type="button">返回</button></form> : <div className="app-lock-actions"><button className="button" disabled={pending} onClick={() => void unlockWithPasskey()} type="button">{pending ? "驗證中…" : "使用 Face ID / Passkey 解鎖"}</button><button className="secondary-button" disabled={pending} onClick={() => setPasswordMode(true)} type="button">使用密碼</button></div>}</section></div>}</>;
}

export { lockSettingKey };
