import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { getCalendarWorkspaceData } from "@/lib/calendar/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const initialData = await getCalendarWorkspaceData(user.id);
  return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">CALENDAR</p><h1>私人日曆</h1><p>整理提醒、重要日期與待辦事項。請勿在行程中放入密碼、金鑰或 Recovery Code。</p><CalendarWorkspace initialData={initialData} /></section></main>;
}
