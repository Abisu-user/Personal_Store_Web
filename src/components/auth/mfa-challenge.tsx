"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MfaChallenge() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (listError || !data?.totp[0]) { router.replace("/security/mfa"); return; }
      setFactorId(data.totp[0].id);
      setPending(false);
    });
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) return;
    setPending(true); setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) { setPending(false); setError("請輸入驗證器顯示的六位數代碼。"); return; }
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) { setPending(false); setError("驗證失敗。請確認代碼仍有效後再試一次。"); return; }
    router.replace("/dashboard"); router.refresh();
  }

  return <form className="form" onSubmit={onSubmit}>{error && <p className="notice error" role="alert">{error}</p>}<div className="field"><label htmlFor="code">六位數驗證碼</label><input autoComplete="one-time-code" disabled={pending} id="code" inputMode="numeric" maxLength={6} name="code" required pattern="[0-9]{6}" /></div><button className="button" disabled={pending} type="submit">{pending ? "準備驗證…" : "驗證並進入保管庫"}</button></form>;
}
