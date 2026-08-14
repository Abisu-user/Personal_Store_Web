import { MfaEnrollment } from "@/components/auth/mfa-enrollment";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  await requireUser();
  return <main className="dashboard"><section className="dashboard-card narrow-card"><p className="eyebrow">ACCOUNT SECURITY</p><h1>雙因素驗證</h1><p>啟用後，除了密碼外還需要驗證器代碼才能登入。</p><MfaEnrollment /></section></main>;
}
