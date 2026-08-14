"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);

    if (signInError) {
      setError("無法登入。請確認 Email、密碼，並完成信箱驗證。");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="field"><label htmlFor="email">Email</label><input autoComplete="email" id="email" name="email" required type="email" /></div>
      <div className="field"><label htmlFor="password">密碼</label><input autoComplete="current-password" id="password" name="password" required type="password" /></div>
      <div className="split-links"><Link className="text-link" href="/forgot-password">忘記密碼？</Link><Link className="text-link" href="/sign-up">建立新帳號</Link></div>
      <button className="button" disabled={pending} type="submit">{pending ? "登入中…" : "安全登入"}</button>
    </form>
  );
}
