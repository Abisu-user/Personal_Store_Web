import React from "react";
import { createRoot } from "react-dom/client";
import { BackgroundSaveProvider } from "@/components/background-save/background-save-provider";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { rangeForMonth, calendarDateKey } from "@/lib/calendar/recurrence";

const today = calendarDateKey(new Date());
const range = rangeForMonth(new Date());
const calendarDays = [{
  date: today, weekday: new Date().getDay(), officialAvailable: true, isDayOff: true,
  dayOffType: "national_holiday" as const, holidayName: "測試假日", festivalName: null, note: "測試假日",
}];
const events = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "測試行程", description: null, startsAt: new Date(today + "T14:00:00").toISOString(), endsAt: null, eventDate: today, eventTime: "14:00", allDay: false, recurrenceType: "none", color: "blue", updatedAt: new Date().toISOString() },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "週年紀念", description: null, startsAt: new Date(today + "T12:00:00").toISOString(), endsAt: null, eventDate: today, eventTime: null, allDay: true, recurrenceType: "yearly", color: "rose", updatedAt: new Date().toISOString() },
] as const;

createRoot(document.getElementById("root")!).render(
  <BackgroundSaveProvider userId="fixture-user">
    <main className="app-main"><div className="dashboard calendarPage"><section className="dashboard-card"><CalendarWorkspace initialData={{ events: [...events], calendarDays, range }} /></section></div></main>
  </BackgroundSaveProvider>,
);
