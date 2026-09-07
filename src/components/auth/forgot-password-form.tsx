"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "password_reset",
        email: String(form.get("email") ?? "").trim(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "目前無法寄送驗證碼，請稍後再試。");
      return;
    }
    router.push("/verify-email?purpose=password_reset");
  }

  return <form className="form" onSubmit={onSubmit}>{error && <p className="notice error" role="alert">{error}</p>}<div className="field"><label htmlFor="email">帳號 Email</label><input autoComplete="email" id="email" name="email" required type="email" /></div><button className="button" disabled={pending} type="submit">{pending ? "寄送中…" : "寄送驗證碼"}</button><p className="auth-privacy-note">如果此 Email 已註冊，我們會寄送密碼重設驗證碼。</p><p className="auth-footer"><Link className="text-link" href="/login">返回登入</Link></p></form>;
}
