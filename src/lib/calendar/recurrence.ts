import type { CalendarEvent, CalendarOccurrence } from "./types";

export function calendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function occurrencesInRange(events: CalendarEvent[], from: string, to: string): CalendarOccurrence[] {
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  const occurrences: CalendarOccurrence[] = [];
  for (const event of events) {
    if (event.recurrenceType === "none") {
      if (event.eventDate >= from && event.eventDate <= to) occurrences.push({ ...event, occurrenceDate: event.eventDate });
      continue;
    }
    const suffix = event.eventDate.slice(4);
    for (let year = firstYear; year <= lastYear; year += 1) {
      const date = `${year}${suffix}`;
      if (date >= from && date <= to && isValidDateKey(date)) occurrences.push({ ...event, occurrenceDate: date });
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
