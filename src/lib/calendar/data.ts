import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CalendarEvent, CalendarWorkspaceData } from "@/lib/calendar/types";
import { getTaiwanCalendarDays } from "@/lib/calendar/taiwan-calendar-provider";
import { buildCalendarDays } from "@/lib/calendar/taiwan-calendar-core";
import { normalizeEventColor } from "@/lib/calendar/event-color";

export async function getCalendarWorkspaceData(ownerId: string, from: string, to: string): Promise<CalendarWorkspaceData> {
  const client = createAdminClient();
  const columns = "id, title, description, starts_at, ends_at, color, updated_at, event_date, event_time, all_day, recurrence_type";
  const [dated, yearly, calendarDays] = await Promise.all([
    client.from("calendar_events").select(columns).eq("owner_id", ownerId).eq("recurrence_type", "none").gte("event_date", from).lte("event_date", to).order("event_date").limit(1000),
    client.from("calendar_events").select(columns).eq("owner_id", ownerId).eq("recurrence_type", "yearly").order("event_date").limit(1000),
    getTaiwanCalendarDays(from, to).catch((error) => {
      console.warn("[calendar] Official day provider failed", error);
      return buildCalendarDays(from, to, new Map());
    }),
  ]);
  if (dated.error || yearly.error) throw new Error("Unable to load calendar events.");
  const events = [...(dated.data ?? []), ...(yearly.data ?? [])].map((event): CalendarEvent => ({
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
  }));
  return { events, calendarDays, range: { from, to } };
}
