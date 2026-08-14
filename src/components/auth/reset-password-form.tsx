"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { passwordError, passwordHint } from "@/components/auth/password-policy";

export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const validationError = passwordError(password);
    if (validationError) { setError(validationError); return; }
    setPending(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (updateError) { setError("重設連結可能已過期，請重新申請一次。 "); return; }
    router.replace("/dashboard"); router.refresh();
  }
  return <form className="form" onSubmit={onSubmit}>{error && <p className="notice error" role="alert">{error}</p>}<div className="field"><label htmlFor="password">新密碼</label><input autoComplete="new-password" id="password" name="password" required type="password" /><p className="hint">{passwordHint}</p></div><button className="button" disabled={pending} type="submit">{pending ? "更新中…" : "更新密碼"}</button></form>;
}
