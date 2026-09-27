import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import mobileStyles from "@/components/calendar/calendar-mobile.module.css";
import { getCalendarWorkspaceData } from "@/lib/calendar/data";
import { rangeForMonth } from "@/lib/calendar/recurrence";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const range = rangeForMonth(new Date());
  const initialData = await getCalendarWorkspaceData(user.id, range.from, range.to);
  return <main className={`dashboard ${mobileStyles.calendarPage}`}><section className="dashboard-card"><CalendarWorkspace initialData={initialData} /></section></main>;
}
