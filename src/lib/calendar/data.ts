import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CalendarEvent, CalendarWorkspaceData } from "@/lib/calendar/types";
import { getTaiwanCalendarDays } from "@/lib/calendar/taiwan-calendar-provider";
import { buildCalendarDays } from "@/lib/calendar/taiwan-calendar-core";
import { normalizeEventColor } from "@/lib/calendar/event-color";

export async function getCalendarWorkspaceData(ownerId: string, from: string, to: string): Promise<CalendarWorkspaceData> {
  const client = createAdminClient();
  const columns = "id, title, description, starts_at, ends_at, color, updated_at, event_date, event_time, all_day, recurrence_type, all_day_reminder_time, time_zone";
  const [dated, recurring, calendarDays] = await Promise.all([
    client.from("calendar_events").select(columns).eq("owner_id", ownerId).eq("recurrence_type", "none").gte("event_date", from).lte("event_date", to).order("event_date").limit(1000),
    client.from("calendar_events").select(columns).eq("owner_id", ownerId).in("recurrence_type", ["daily", "weekly", "yearly"]).lte("event_date", to).order("event_date").limit(1000),
    getTaiwanCalendarDays(from, to).catch((error) => {
      console.warn("[calendar] Official day provider failed", error);
      return buildCalendarDays(from, to, new Map());
    }),
  ]);
  if (dated.error || recurring.error) throw new Error("Unable to load calendar events.");
  const rows = [...(dated.data ?? []), ...(recurring.data ?? [])];
  const ids = rows.map((event) => event.id);
  const reminders = ids.length ? await client.from("calendar_event_reminders").select("event_id, offset_minutes").eq("owner_id", ownerId).in("event_id", ids) : { data: [], error: null };
  if (reminders.error) throw new Error("Unable to load calendar reminders.");
  const offsets = new Map<string, number[]>();
  for (const reminder of reminders.data ?? []) offsets.set(reminder.event_id, [...(offsets.get(reminder.event_id) ?? []), reminder.offset_minutes]);
  const events = rows.map((event): CalendarEvent => ({
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    color: normalizeEventColor(event.color),
    updatedAt: event.updated_at,
    eventDate: event.event_date,
    eventTime: event.event_time,
    allDay: event.all_day,
    recurrenceType: event.recurrence_type as CalendarEvent["recurrenceType"],
    reminders: offsets.get(event.id) ?? [],
    allDayReminderTime: event.all_day_reminder_time?.slice(0, 5) ?? "09:00",
    timeZone: event.time_zone ?? "Asia/Taipei",
  }));
  return { events, calendarDays, range: { from, to } };
}
