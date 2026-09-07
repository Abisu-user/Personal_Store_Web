"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { passwordError, passwordHint } from "@/components/auth/password-policy";
import { PasswordInput } from "@/components/auth/password-input";

export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    const validationError = passwordError(password);
    if (validationError) { setError(validationError); return; }
    if (password !== confirmation) { setError("兩次輸入的新密碼不一致。"); return; }
    setPending(true);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) { setError(data.error ?? "密碼重設授權可能已過期，請重新申請一次。"); return; }
    router.push("/login?password_reset=success");
  }
  return <form className="form" onSubmit={onSubmit}>{error && <p className="notice error" role="alert">{error}</p>}<PasswordInput autoComplete="new-password" hint={passwordHint} id="password" label="新密碼" name="password" /><PasswordInput autoComplete="new-password" id="confirmation" label="再次輸入新密碼" name="confirmation" /><button className="button" disabled={pending} type="submit">{pending ? "更新中…" : "更新密碼"}</button></form>;
}
