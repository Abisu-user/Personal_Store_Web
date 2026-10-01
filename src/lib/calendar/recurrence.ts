import type { CalendarEvent } from "./types";

export function calendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calendarDateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function occurrencesInRange<T extends Pick<CalendarEvent, "eventDate" | "eventTime" | "allDay" | "recurrenceType">>(events: T[], from: string, to: string): Array<T & { occurrenceDate: string }> {
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  const occurrences: Array<T & { occurrenceDate: string }> = [];
  for (const event of events) {
    if (event.recurrenceType === "none") {
      if (event.eventDate >= from && event.eventDate <= to) occurrences.push({ ...event, occurrenceDate: event.eventDate });
      continue;
    }
    if (event.recurrenceType === "daily" || event.recurrenceType === "weekly") {
      const start = Math.max(Date.parse(`${event.eventDate}T00:00:00Z`), Date.parse(`${from}T00:00:00Z`));
      const finish = Date.parse(`${to}T00:00:00Z`);
      const interval = event.recurrenceType === "weekly" ? 7 : 1;
      const anchor = Date.parse(`${event.eventDate}T00:00:00Z`);
      const daysSinceAnchor = Math.round((start - anchor) / 86_400_000);
      const first = start + ((interval - daysSinceAnchor % interval) % interval) * 86_400_000;
      for (let time = first; time <= finish; time += interval * 86_400_000) {
        occurrences.push({ ...event, occurrenceDate: new Date(time).toISOString().slice(0, 10) });
      }
      continue;
    }
    const suffix = event.eventDate.slice(4);
    for (let year = firstYear; year <= lastYear; year += 1) {
      const date = `${year}${suffix}`;
      if (date >= event.eventDate && date >= from && date <= to && isValidDateKey(date)) occurrences.push({ ...event, occurrenceDate: date });
    }
  }
  return occurrences.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || Number(a.allDay) * -1 - Number(b.allDay) * -1 || (a.eventTime ?? "").localeCompare(b.eventTime ?? ""));
}

export function rangeForMonth(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const from = new Date(first);
  from.setDate(first.getDate() - first.getDay());
  const to = new Date(month.getFullYear(), month.getMonth() + 3, 0);
  return { from: calendarDateKey(from), to: calendarDateKey(to) };
}
