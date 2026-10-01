import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEventColor } from "@/lib/calendar/event-color";
import { summarizeCalendarDay, type TodayCalendarSchedule, type TodayCalendarSource } from "@/lib/calendar/today";

/** Only today's one-off events and recurrence rules are needed; no reminders or holiday provider. */
export async function getDashboardTodaySchedule(ownerId: string, date: string): Promise<TodayCalendarSchedule | null> {
  const client = createAdminClient();
  const columns = "id,title,color,event_date,event_time,all_day,recurrence_type";
  const [dated, recurring] = await Promise.all([
    client.from("calendar_events").select(columns, { count: "exact" })
      .eq("owner_id", ownerId).eq("recurrence_type", "none").eq("event_date", date)
      .limit(1000).abortSignal(AbortSignal.timeout(12000)),
    client.from("calendar_events").select(columns, { count: "exact" })
      .eq("owner_id", ownerId).in("recurrence_type", ["daily", "weekly", "yearly"])
      .lte("event_date", date).limit(1000).abortSignal(AbortSignal.timeout(12000)),
  ]);
  if (dated.error || recurring.error || dated.count === null || recurring.count === null
    || dated.count > (dated.data?.length ?? 0) || recurring.count > (recurring.data?.length ?? 0)) {
    throw dated.error ?? recurring.error ?? new Error("Dashboard calendar query incomplete");
  }
  const events: TodayCalendarSource[] = [...dated.data, ...recurring.data].map((row) => ({
    id: row.id,
    title: row.title,
    color: normalizeEventColor(row.color),
    eventDate: row.event_date,
    eventTime: row.event_time,
    allDay: row.all_day,
    recurrenceType: row.recurrence_type as TodayCalendarSource["recurrenceType"],
  }));
  return summarizeCalendarDay(events, date);
}
