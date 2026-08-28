"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/auth/password-input";
import { OperationStatus } from "@/components/ui/modal-dialog";

export function LoginForm() {
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    setProgress("正在驗證帳號與密碼…");
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (signInError) {
      setPending(false);
      setProgress(null);
      setError("無法登入。請確認 Email、密碼，並完成信箱驗證。");
      return;
    }
    window.sessionStorage.setItem("personal-vault:unlock-after-login", "1");
    setProgress("正在確認帳號安全驗證…");
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setProgress("登入成功，正在開啟你的保管庫…");
    const destination = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2"
      ? "/mfa-challenge"
      : "/dashboard";
    // Supabase persists the fresh session in a browser cookie.  A full
    // navigation after that write avoids reusing the App Router's anonymous
    // login response, which could otherwise bounce a newly signed-in user
    // straight back to /login.
    window.setTimeout(() => window.location.assign(destination), 120);
  }

  async function signInWithPasskey() {
    setPending(true); setError(null); setProgress("正在使用 Face ID / Passkey 驗證…");
    const { error: passkeyError } = await createClient().auth.signInWithPasskey();
    if (passkeyError) { setPending(false); setProgress(null); setError(passkeyError.code === "passkey_disabled" ? "Face ID / Passkey 尚未啟用，請使用帳號密碼登入。" : "無法完成 Face ID / Passkey 驗證。請再試一次或使用帳號密碼。"); return; }
    window.sessionStorage.setItem("personal-vault:unlock-after-login", "1");
    setProgress("登入成功，正在開啟你的保管庫…");
    window.setTimeout(() => window.location.assign("/dashboard"), 120);
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      {progress && <OperationStatus label={progress} />}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="field"><label htmlFor="email">Email</label><input autoComplete="email" id="email" name="email" required type="email" /></div>
      <PasswordInput autoComplete="current-password" id="password" label="密碼" name="password" />
      <div className="split-links"><Link className="text-link" href="/forgot-password">忘記密碼？</Link><Link className="text-link" href="/sign-up">建立新帳號</Link></div>
      <button className="button" disabled={pending} type="submit">{pending ? "登入中…" : "安全登入"}</button>
      <button className="secondary-button" disabled={pending} onClick={() => void signInWithPasskey()} type="button">使用 Face ID / Passkey</button>
    </form>
  );
}
