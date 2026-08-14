"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { passwordError, passwordHint } from "@/components/auth/password-policy";
import { PasswordInput } from "@/components/auth/password-input";

export function SignUpForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const validationError = passwordError(password);
    if (validationError) { setError(validationError); return; }
    setPending(true);
    const { error: signUpError } = await createClient().auth.signUp({
      email: String(form.get("email") ?? "").trim(),
      password,
      options: {
        data: { display_name: String(form.get("displayName") ?? "").trim() },
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/verify-email`,
      },
    });
    setPending(false);
    if (signUpError) { setError("目前無法建立帳號，請稍後再試。若此 Email 已註冊，請改用登入或重設密碼。"); return; }
    setSuccess(true);
  }

  if (success) return <p className="notice success" role="status">驗證信已寄出。請開啟 Email 內的連結，完成驗證後再登入。</p>;

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
