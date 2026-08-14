"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/auth/password-input";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);

    if (signInError) {
      setError("無法登入。請確認 Email、密碼，並完成信箱驗證。");
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    router.replace(aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2" ? "/mfa-challenge" : "/dashboard");
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="field"><label htmlFor="email">Email</label><input autoComplete="email" id="email" name="email" required type="email" /></div>
      <PasswordInput autoComplete="current-password" id="password" label="密碼" name="password" />
      <div className="split-links"><Link className="text-link" href="/forgot-password">忘記密碼？</Link><Link className="text-link" href="/sign-up">建立新帳號</Link></div>
      <button className="button" disabled={pending} type="submit">{pending ? "登入中…" : "安全登入"}</button>
    </form>
  );
}
