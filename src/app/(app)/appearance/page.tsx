import { AppearanceSettings } from "@/components/appearance/appearance-settings";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function AppearancePage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">PERSONALIZE</p><h1>外觀與布局</h1><p>調整適合自己的顯示方式。外觀偏好只存放於目前瀏覽器，不包含任何私人資料。</p><AppearanceSettings /></section></main>;
}
