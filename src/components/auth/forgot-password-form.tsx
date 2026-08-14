"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    await createClient().auth.resetPasswordForEmail(String(form.get("email") ?? "").trim(), {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    });
    setPending(false);
    setSent(true);
  }

  if (sent) return <p className="notice success" role="status">若此 Email 有對應帳號，重設連結已寄出。請查看收件匣與垃圾郵件。</p>;
  return <form className="form" onSubmit={onSubmit}><div className="field"><label htmlFor="email">帳號 Email</label><input autoComplete="email" id="email" name="email" required type="email" /></div><button className="button" disabled={pending} type="submit">{pending ? "寄送中…" : "寄送重設連結"}</button><p className="auth-footer"><Link className="text-link" href="/login">返回登入</Link></p></form>;
}
