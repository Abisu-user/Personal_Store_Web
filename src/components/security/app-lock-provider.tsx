"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LockDelay = "immediate" | "30" | "60" | "300" | "900";
type PinMode = "pin4" | "pin6";
type PinStatus = { configured: boolean; mode: PinMode | null };

const lockDelayMs: Record<LockDelay, number> = {
  immediate: 0,
  "30": 30_000,
  "60": 60_000,
  "300": 300_000,
  "900": 900_000,
};

const lockSettingKey = "personal-vault:app-lock-delay:v1";
const pinStatusCacheKey = "personal-vault:app-lock-pin-status:v1";
const pinStatusEvent = "personal-vault:app-lock-pin-updated";
const unlockSessionKey = "personal-vault:app-lock-session-unlocked:v1";
const emptyPinStatus: PinStatus = { configured: false, mode: null };

function readDelay(): LockDelay {
  const value = window.localStorage.getItem(lockSettingKey);
  return value === "30" || value === "60" || value === "300" || value === "900" ? value : "immediate";
}

function isPinStatus(value: unknown): value is PinStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { configured?: unknown; mode?: unknown };
  return typeof candidate.configured === "boolean" && (candidate.mode === null || candidate.mode === "pin4" || candidate.mode === "pin6");
}

function readCachedPinStatus(): PinStatus {
  if (typeof window === "undefined") return emptyPinStatus;
  try {
    const value = JSON.parse(window.localStorage.getItem(pinStatusCacheKey) ?? "null");
    return isPinStatus(value) ? value : emptyPinStatus;
  } catch {
    return emptyPinStatus;
  }
}

function persistPinStatus(status: PinStatus) {
  if (typeof window === "undefined") return;
  try {
    if (status.configured && status.mode) window.localStorage.setItem(pinStatusCacheKey, JSON.stringify(status));
    else window.localStorage.removeItem(pinStatusCacheKey);
  } catch {
    // Private browsing can disallow storage. The remote status remains authoritative.
  }
}

async function getPinStatus(): Promise<PinStatus> {
  const response = await fetch("/api/security/app-lock", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load App PIN status");
  const status = await response.json() as unknown;
  if (!isPinStatus(status)) throw new Error("Invalid App PIN status");
  return status;
}

export function AppLockProvider({ children, email, initialPinStatus }: { children: ReactNode; email: string; initialPinStatus: PinStatus | null }) {
  const [locked, setLocked] = useState(true);
  const [pending, setPending] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  // Only the public PIN configuration and length are cached—never a PIN or
  // verifier—so the keypad can appear immediately. Verification stays server-side.
  const [pinStatus, setPinStatus] = useState<PinStatus>(() => initialPinStatus ?? readCachedPinStatus());
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const backgroundAt = useRef<number | null>(null);
  const lockTimer = useRef<number | null>(null);
  const statusRefreshTimer = useRef<number | null>(null);
  const needsClientPinStatusRefresh = useRef(initialPinStatus === null);

  const lock = useCallback(() => {
    if (lockTimer.current) window.clearTimeout(lockTimer.current);
    window.sessionStorage.removeItem(unlockSessionKey);
    document.documentElement.dataset.vaultLocked = "true";
    setPin("");
    setLocked(true);
    setPasswordMode(false);
  }, []);

  const unlock = useCallback(() => {
    if (lockTimer.current) window.clearTimeout(lockTimer.current);
    window.sessionStorage.setItem(unlockSessionKey, "1");
    document.documentElement.dataset.vaultLocked = "false";
    setError(null);
    setPin("");
    setPasswordMode(false);
    setLocked(false);
  }, []);

  const applyPinStatus = useCallback((status: PinStatus) => {
    persistPinStatus(status);
    setPinStatus(status);
  }, []);

  const loadPinStatus = useCallback(async () => {
    try {
      applyPinStatus(await getPinStatus());
    } catch {
      // Keep a usable cached keypad if a slow/offline status request fails.
      // The verify request still checks the PIN on the server.
    }
  }, [applyPinStatus]);

  useEffect(() => {
    const justAuthenticated = window.sessionStorage.getItem("personal-vault:unlock-after-login") === "1";
    if (justAuthenticated) {
      window.sessionStorage.removeItem("personal-vault:unlock-after-login");
      unlock();
    } else if (window.sessionStorage.getItem(unlockSessionKey) === "1" && document.visibilityState === "visible") {
      unlock();
    } else {
      lock();
    }

    // A server-rendered status is already current for this page request. Only
    // use the client endpoint as a fallback when the server lookup failed.
    if (initialPinStatus) persistPinStatus(initialPinStatus);
    if (needsClientPinStatusRefresh.current) {
      if (pinStatus.configured) statusRefreshTimer.current = window.setTimeout(() => void loadPinStatus(), 350);
      else void loadPinStatus();
    }

    const onPinUpdated = () => void loadPinStatus();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        backgroundAt.current = Date.now();
        const delay = readDelay();
        if (delay === "immediate") lock();
        else lockTimer.current = window.setTimeout(lock, lockDelayMs[delay]);
        return;
      }
      const delay = readDelay();
      if (backgroundAt.current && Date.now() - backgroundAt.current >= lockDelayMs[delay]) lock();
      backgroundAt.current = null;
    };
    const onPageHide = () => lock();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener(pinStatusEvent, onPinUpdated);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener(pinStatusEvent, onPinUpdated);
      if (lockTimer.current) window.clearTimeout(lockTimer.current);
      if (statusRefreshTimer.current) window.clearTimeout(statusRefreshTimer.current);
    };
  }, [initialPinStatus, loadPinStatus, lock, pinStatus.configured, unlock]);

  async function unlockWithPasskey() {
    setPending(true);
    setError(null);
    const { error: passkeyError } = await createClient().auth.signInWithPasskey();
    setPending(false);
    if (passkeyError) {
      setError(passkeyError.code === "passkey_disabled"
        ? "Face ID / Passkey 尚未在安全設定啟用。你仍可使用 App PIN 或登入密碼解鎖。"
        : "無法完成 Face ID / Passkey 驗證，請再試一次或使用 App PIN。");
      return;
    }
    unlock();
  }

  async function unlockWithPin(value = pin) {
    if (!pinStatus.mode || value.length !== (pinStatus.mode === "pin4" ? 4 : 6)) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/security/app-lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", pin: value }),
    });
    const result = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setPin("");
      setError(result.error ?? "PIN 碼驗證失敗，請再試一次。");
      return;
    }
    unlock();
  }

  function appendPin(digit: string) {
    if (pending || !pinStatus.mode) return;
    const length = pinStatus.mode === "pin4" ? 4 : 6;
    const next = `${pin}${digit}`.slice(0, length);
    setPin(next);
    if (next.length === length) window.setTimeout(() => void unlockWithPin(next), 0);
  }

  async function unlockWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) {
      setError("目前工作階段無法確認帳號，請使用一般登入。");
      return;
    }
    setPending(true);
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const { error: passwordError } = await createClient().auth.signInWithPassword({ email, password });
    setPending(false);
    if (passwordError) {
      setError("密碼不正確，請再試一次。");
      return;
    }
    unlock();
  }

  const pinLength = pinStatus.mode === "pin4" ? 4 : 6;

  return <>{children}{locked && <div aria-live="polite" className="app-lock-overlay" role="dialog" aria-modal="true"><section className="app-lock-card"><img alt="" src="/icon.svg" /><p className="eyebrow">PERSONAL VAULT</p><h1>Vault 已鎖定</h1><p>需要驗證身分才能繼續；你的資料不會顯示在鎖定畫面中。</p>{error && <p className="notice error" role="alert">{error}</p>}{passwordMode ? <form className="form" onSubmit={unlockWithPassword}><label className="field" htmlFor="app-lock-password">使用登入密碼解鎖<input autoComplete="current-password" id="app-lock-password" minLength={10} name="password" required type="password" /></label><button className="button" disabled={pending} type="submit">{pending ? "驗證中…" : "使用登入密碼解鎖"}</button><button className="secondary-button" disabled={pending} onClick={() => setPasswordMode(false)} type="button">返回</button></form> : <div className="app-lock-actions">{pinStatus.configured && pinStatus.mode && <div className="app-pin-unlock"><p>{pinStatus.mode === "pin4" ? "輸入 4 位數 App PIN" : "輸入 6 位數 App PIN"}</p><div aria-label="已輸入的 PIN 位數" className="app-pin-dots">{Array.from({ length: pinLength }, (_, index) => <i className={index < pin.length ? "filled" : ""} key={index} />)}</div><div className="app-pin-pad">{"123456789".split("").map((digit) => <button aria-label={`數字 ${digit}`} disabled={pending} key={digit} onClick={() => appendPin(digit)} type="button">{digit}</button>)}<span /><button aria-label="數字 0" disabled={pending} onClick={() => appendPin("0")} type="button">0</button><button aria-label="刪除一位 PIN" className="app-pin-backspace" disabled={pending || !pin} onClick={() => setPin((current) => current.slice(0, -1))} type="button">⌫</button></div></div>}<button className="button" disabled={pending} onClick={() => void unlockWithPasskey()} type="button">{pending ? "驗證中…" : "使用 Face ID / Passkey 解鎖"}</button><button className="secondary-button" disabled={pending} onClick={() => setPasswordMode(true)} type="button">使用登入密碼</button></div>}</section></div>}</>;
}

export { lockSettingKey, pinStatusEvent };
