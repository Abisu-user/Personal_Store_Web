import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await requireUser(); await requireMfaIfEnrolled();
  return <main className="dashboard"><section className="dashboard-card coming-soon"><p className="eyebrow">CALENDAR</p><span className="coming-soon-icon">◌</span><h1>日曆正在準備中</h1><p>之後可在這裡整理提醒、重要日期與保管庫待辦事項。</p></section></main>;
}
