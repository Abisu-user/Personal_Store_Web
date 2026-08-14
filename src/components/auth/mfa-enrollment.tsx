"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Enrollment = { factorId: string; qrCode: string; secret: string };

export function MfaEnrollment() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void createClient().auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (listError) { setError("無法讀取雙因素驗證狀態，請重新整理頁面。"); } else { setEnabled((data?.totp.length ?? 0) > 0); }
      setPending(false);
    });
  }, []);

  async function beginEnrollment() {
    setPending(true); setError(null);
    const { data, error: enrollError } = await createClient().auth.mfa.enroll({ factorType: "totp", friendlyName: "Personal Digital Vault" });
    if (enrollError || !data?.totp) { setPending(false); setError("無法建立驗證器，請稍後再試。"); return; }
    setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    setPending(false);
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) { setError("請輸入驗證器顯示的六位數代碼。"); return; }
    setPending(true); setError(null);
    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
    if (challengeError || !challenge) { setPending(false); setError("無法開始驗證，請稍後再試。"); return; }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: enrollment.factorId, challengeId: challenge.id, code });
    if (verifyError) { setPending(false); setError("驗證失敗。請確認代碼仍有效後再試一次。"); return; }
    setEnabled(true); setEnrollment(null); setPending(false); setSuccess("雙因素驗證已啟用；此工作階段已提升為 AAL2。");
  }

  if (pending && !enrollment) return <p className="lead">正在讀取安全設定…</p>;
  if (enabled) return <p className="notice success" role="status">{success ?? "TOTP 雙因素驗證已啟用。之後每次登入都需要驗證器代碼。"}</p>;
  if (!enrollment) return <div className="form">{error && <p className="notice error" role="alert">{error}</p>}<p className="lead">使用 Google Authenticator、1Password、Authy 或其他支援 TOTP 的驗證器。</p><button className="button" disabled={pending} onClick={beginEnrollment} type="button">設定驗證器</button></div>;
  return <form className="form" onSubmit={verifyEnrollment}>{error && <p className="notice error" role="alert">{error}</p>}<p className="lead">以驗證器掃描 QR code，或手動輸入下方密鑰；完成後輸入目前顯示的代碼。</p><Image alt="TOTP 驗證器 QR code" className="mfa-qr" height={208} priority src={enrollment.qrCode} unoptimized width={208} /><div className="mfa-secret"><strong>手動設定密鑰</strong><code>{enrollment.secret}</code></div><div className="field"><label htmlFor="code">六位數驗證碼</label><input autoComplete="one-time-code" id="code" inputMode="numeric" maxLength={6} name="code" required pattern="[0-9]{6}" /></div><button className="button" disabled={pending} type="submit">{pending ? "驗證中…" : "啟用雙因素驗證"}</button></form>;
}
