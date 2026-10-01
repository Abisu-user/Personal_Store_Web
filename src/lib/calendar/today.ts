import type { CalendarEvent } from "./types";
import { occurrencesInRange } from "./recurrence";

export type TodayCalendarEvent = { id: string; title: string; color: string; time: string | null; allDay: boolean };
export type TodayCalendarSchedule = { date: string; total: number; events: TodayCalendarEvent[] };
export type TodayCalendarSource = Pick<CalendarEvent, "id" | "title" | "color" | "eventDate" | "eventTime" | "allDay" | "recurrenceType">;

/** The Calendar and Dashboard share the same occurrence resolver and ordering. */
export function summarizeCalendarDay(events: TodayCalendarSource[], date: string): TodayCalendarSchedule | null {
  const occurrences = occurrencesInRange(events, date, date);
  if (!occurrences.length) return null;
  return {
    date,
    total: occurrences.length,
    events: occurrences.slice(0, 3).map((event) => ({
      id: event.id,
      title: event.title,
      color: event.color,
      time: event.allDay ? null : event.eventTime?.slice(0, 5) ?? null,
      allDay: event.allDay,
    })),
  };
}
