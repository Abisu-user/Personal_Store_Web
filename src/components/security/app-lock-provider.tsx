"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMobileModalLayout } from "@/components/ui/mobile-modal-layout";
import {
  GlassyPinVerification,
  pinVerificationErrorFromResponse,
} from "@/components/security/glassy-pin-verification";

type LockDelay = "immediate" | "30" | "60" | "300" | "900";
type PinMode = "pin4" | "pin6";
type PinStatus = { configured: boolean; mode: PinMode | null; autoLockEnabled: boolean };

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
const emptyPinStatus: PinStatus = { configured: false, mode: null, autoLockEnabled: false };

function readDelay(): LockDelay {
  const value = window.localStorage.getItem(lockSettingKey);
  return value === "30" || value === "60" || value === "300" || value === "900" ? value : "immediate";
}

function isPinStatus(value: unknown): value is PinStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { configured?: unknown; mode?: unknown };
  return typeof candidate.configured === "boolean" && typeof (candidate as { autoLockEnabled?: unknown }).autoLockEnabled === "boolean" && (candidate.mode === null || candidate.mode === "pin4" || candidate.mode === "pin6");
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
  const [locked, setLocked] = useState(() => initialPinStatus?.autoLockEnabled !== false);
  const [pending, setPending] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  // Only the public PIN configuration and length are cached—never a PIN or
  // verifier—so the keypad can appear immediately. Verification stays server-side.
  const [pinStatus, setPinStatus] = useState<PinStatus>(() => initialPinStatus ?? readCachedPinStatus());
  const [error, setError] = useState<string | null>(null);
  const backgroundAt = useRef<number | null>(null);
  const lockTimer = useRef<number | null>(null);
  const statusRefreshTimer = useRef<number | null>(null);
  const needsClientPinStatusRefresh = useRef(initialPinStatus === null);

  useMobileModalLayout(locked);

  const lock = useCallback(() => {
    if (lockTimer.current) window.clearTimeout(lockTimer.current);
    if (!pinStatus.autoLockEnabled) {
      document.documentElement.dataset.vaultLocked = "false";
      setLocked(false);
      return;
    }
    window.sessionStorage.removeItem(unlockSessionKey);
    document.documentElement.dataset.vaultLocked = "true";
    setLocked(true);
    setPasswordMode(false);
  }, [pinStatus.autoLockEnabled]);

  const unlock = useCallback(() => {
    if (lockTimer.current) window.clearTimeout(lockTimer.current);
    window.sessionStorage.setItem(unlockSessionKey, "1");
    document.documentElement.dataset.vaultLocked = "false";
    setError(null);
    setPasswordMode(false);
    setLocked(false);
  }, []);

  const applyPinStatus = useCallback((status: PinStatus) => {
    persistPinStatus(status);
    setPinStatus(status);
    if (!status.autoLockEnabled) unlock();
  }, [unlock]);

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
    const initialStateTimer = window.setTimeout(() => {
      if (!pinStatus.autoLockEnabled) {
        unlock();
      } else if (justAuthenticated) {
        window.sessionStorage.removeItem("personal-vault:unlock-after-login");
        unlock();
      } else if (window.sessionStorage.getItem(unlockSessionKey) === "1" && document.visibilityState === "visible") {
        unlock();
      } else {
        lock();
      }
    }, 0);

    // A server-rendered status is already current for this page request. Only
    // use the client endpoint as a fallback when the server lookup failed.
    if (initialPinStatus) persistPinStatus(initialPinStatus);
    if (needsClientPinStatusRefresh.current) {
      statusRefreshTimer.current = window.setTimeout(() => void loadPinStatus(), pinStatus.configured ? 350 : 0);
    }

    const onPinUpdated = () => void loadPinStatus();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (!pinStatus.autoLockEnabled) return;
        backgroundAt.current = Date.now();
        const delay = readDelay();
        if (delay === "immediate") lock();
        else lockTimer.current = window.setTimeout(lock, lockDelayMs[delay]);
        return;
      }
      // Auto-lock is account scoped. Refresh when this tab becomes visible so
      // changes made on another device do not remain stale indefinitely.
      void loadPinStatus();
      if (!pinStatus.autoLockEnabled) return;
      const delay = readDelay();
      if (backgroundAt.current && Date.now() - backgroundAt.current >= lockDelayMs[delay]) lock();
      backgroundAt.current = null;
    };
    const onFocus = () => void loadPinStatus();
    const onPageHide = () => { if (pinStatus.autoLockEnabled) lock(); };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener(pinStatusEvent, onPinUpdated);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener(pinStatusEvent, onPinUpdated);
      window.clearTimeout(initialStateTimer);
      if (lockTimer.current) window.clearTimeout(lockTimer.current);
      if (statusRefreshTimer.current) window.clearTimeout(statusRefreshTimer.current);
    };
  }, [initialPinStatus, loadPinStatus, lock, pinStatus.autoLockEnabled, pinStatus.configured, unlock]);

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

  async function verifyAppPin(value: string) {
    if (!pinStatus.mode || value.length !== (pinStatus.mode === "pin4" ? 4 : 6)) return;
    const response = await fetch("/api/security/app-lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", pin: value }),
    });
    if (!response.ok) {
      throw await pinVerificationErrorFromResponse(response, "PIN 碼驗證失敗，請再試一次。");
    }
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

  return <>{children}{locked && <div aria-live="polite" className="app-lock-overlay" role="dialog" aria-modal="true">{passwordMode ? <section className="app-lock-card"><img alt="" src="/icon.svg" /><p className="eyebrow">PERSONAL VAULT</p><h1>使用登入密碼解鎖</h1><p>輸入目前帳號的登入密碼；驗證內容不會儲存在裝置中。</p>{error && <p className="notice error" role="alert">{error}</p>}<form className="form" onSubmit={unlockWithPassword}><label className="field" htmlFor="app-lock-password">登入密碼<input autoComplete="current-password" id="app-lock-password" minLength={10} name="password" required type="password" /></label><button className="button" disabled={pending} type="submit">{pending ? "驗證中…" : "使用登入密碼解鎖"}</button><button className="secondary-button" disabled={pending} onClick={() => { setPasswordMode(false); setError(null); }} type="button">返回 PIN 驗證</button></form></section> : pinStatus.configured && pinStatus.mode ? <GlassyPinVerification
    length={pinStatus.mode === "pin4" ? 4 : 6}
    verifyPin={verifyAppPin}
    onVerified={unlock}
    title="Vault 已鎖定"
    description="輸入 App PIN；完成最後一碼後會自動驗證。"
    externalMessage={error ?? undefined}
    secondaryActions={(busy) => <><button className="button" disabled={busy || pending} onClick={() => void unlockWithPasskey()} type="button">{pending ? "驗證中…" : "使用 Face ID / Passkey 解鎖"}</button><button className="secondary-button" disabled={busy || pending} onClick={() => { setPasswordMode(true); setError(null); }} type="button">使用登入密碼</button></>}
  /> : <section className="app-lock-card"><img alt="" src="/icon.svg" /><p className="eyebrow">PERSONAL VAULT</p><h1>Vault 已鎖定</h1><p>需要驗證身分才能繼續；你的資料不會顯示在鎖定畫面中。</p>{error && <p className="notice error" role="alert">{error}</p>}<div className="app-lock-actions"><button className="button" disabled={pending} onClick={() => void unlockWithPasskey()} type="button">{pending ? "驗證中…" : "使用 Face ID / Passkey 解鎖"}</button><button className="secondary-button" disabled={pending} onClick={() => setPasswordMode(true)} type="button">使用登入密碼</button></div></section>}</div>}</>;
}

export { lockSettingKey, pinStatusEvent };
