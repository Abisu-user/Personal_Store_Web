"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { passwordError, passwordHint } from "@/components/auth/password-policy";
import { PasswordInput } from "@/components/auth/password-input";

export function SignUpForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const validationError = passwordError(password);
    if (validationError) { setError(validationError); return; }
    setPending(true);
    const response = await fetch("/api/auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "email_verification",
        email: String(form.get("email") ?? "").trim(),
        password,
        displayName: String(form.get("displayName") ?? "").trim(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "目前無法建立帳號，請稍後再試。若此 Email 已註冊，請改用登入或重設密碼。");
      return;
    }
    router.push("/verify-email?purpose=email_verification");
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="field"><label htmlFor="displayName">顯示名稱</label><input autoComplete="name" id="displayName" maxLength={80} name="displayName" required /></div>
      <div className="field"><label htmlFor="email">Email</label><input autoComplete="email" id="email" name="email" required type="email" /></div>
      <PasswordInput autoComplete="new-password" hint={passwordHint} id="password" label="設定密碼" name="password" />
      <button className="button" disabled={pending} type="submit">{pending ? "建立中…" : "建立並驗證帳號"}</button>
      <p className="auth-footer">已有帳號？ <Link className="text-link" href="/login">前往登入</Link></p>
    </form>
  );
}
