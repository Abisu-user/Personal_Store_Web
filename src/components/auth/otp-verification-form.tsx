"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { OTP_LENGTH, sanitizeOtp, type OtpPurpose } from "@/lib/auth/otp-policy";

type Status = {
  active: boolean;
  canResend?: boolean;
  maskedEmail?: string;
  expiresIn?: number;
  retryAfter?: number;
  attemptsRemaining?: number;
};

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function OtpVerificationForm({ purpose }: { purpose: OtpPurpose }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState("");
  const [expiresIn, setExpiresIn] = useState(0);
  const [retryAfter, setRetryAfter] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startPath = purpose === "email_verification" ? "/sign-up" : "/forgot-password";

  async function refreshStatus() {
    const response = await fetch(`/api/auth/otp/status?purpose=${purpose}`, { cache: "no-store" });
    const data = await response.json() as Status;
    setStatus(data);
    setExpiresIn(data.expiresIn ?? 0);
    setRetryAfter(data.retryAfter ?? 0);
  }

  useEffect(() => {
    let live = true;
    fetch(`/api/auth/otp/status?purpose=${purpose}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Status) => {
        if (!live) return;
        setStatus(data);
        setExpiresIn(data.expiresIn ?? 0);
        setRetryAfter(data.retryAfter ?? 0);
      })
      .catch(() => live && setStatus({ active: false }));
    return () => { live = false; };
  }, [purpose]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setInterval(() => {
      setExpiresIn((value) => Math.max(0, value - 1));
      setRetryAfter((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== OTP_LENGTH) { setError("請輸入 6 位數驗證碼。"); return; }
    setPending(true); setError(null);
    const response = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, code }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "目前無法驗證，請稍後再試。");
      setCode("");
      await refreshStatus().catch(() => undefined);
      return;
    }
    window.location.assign(data.destination ?? (purpose === "email_verification" ? "/login" : "/reset-password"));
  }

  async function resend() {
    if (retryAfter > 0 || pending) return;
    setPending(true); setError(null);
    const response = await fetch("/api/auth/otp/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "目前無法重新寄送驗證碼。");
      setRetryAfter(Number(data.retryAfter) || 0);
      return;
    }
    setCode("");
    setExpiresIn(Number(data.expiresIn) || 600);
    setRetryAfter(Number(data.retryAfter) || 60);
    setStatus((current) => ({ ...(current ?? { active: true }), active: true, canResend: true, attemptsRemaining: 5 }));
  }

  if (status === null) return <p className="notice" role="status">正在確認驗證流程…</p>;
  if (!status.active) return <div className="otp-expired"><p className="notice error" role="alert">驗證碼已失效或過期，請重新寄送驗證碼。</p>{error && <p className="notice error" role="alert">{error}</p>}{status.canResend && <button className="button" disabled={pending || retryAfter > 0} onClick={() => void resend()} type="button">{retryAfter > 0 ? `重新寄送（${retryAfter}）` : "重新寄送驗證碼"}</button>}<Link className="secondary-button" href={startPath}>重新開始</Link></div>;

  return (
    <form className="form otp-form" onSubmit={verify}>
      {error && <p className="notice error" role="alert">{error}</p>}
      <p className="otp-destination">驗證碼已寄送到 <strong>{status.maskedEmail}</strong></p>
      <div className="field">
        <label htmlFor="otp-code">6 位數驗證碼</label>
        <input
          aria-describedby="otp-expiry"
          autoComplete="one-time-code"
          autoFocus
          className="otp-input"
          id="otp-code"
          inputMode="numeric"
          maxLength={OTP_LENGTH}
          onChange={(event) => setCode(sanitizeOtp(event.target.value))}
          pattern="[0-9]*"
          placeholder="000000"
          required
          type="text"
          value={code}
        />
      </div>
      <p className="otp-meta" id="otp-expiry">有效時間 {clock(expiresIn)} · 尚可嘗試 {status.attemptsRemaining ?? 0} 次</p>
      <button className="button" disabled={pending || expiresIn === 0} type="submit">{pending ? "驗證中…" : "驗證"}</button>
      <button className="secondary-button" disabled={pending || retryAfter > 0} onClick={() => void resend()} type="button">
        {retryAfter > 0 ? `重新寄送（${retryAfter}）` : "重新寄送驗證碼"}
      </button>
      <p className="auth-footer"><Link className="text-link" href={startPath}>返回上一步</Link></p>
    </form>
  );
}
