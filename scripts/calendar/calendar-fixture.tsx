import React from "react";
import { createRoot } from "react-dom/client";
import { BackgroundSaveProvider } from "@/components/background-save/background-save-provider";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { rangeForMonth, calendarDateKey } from "@/lib/calendar/recurrence";

const today = calendarDateKey(new Date());
const range = rangeForMonth(new Date());
const ordinaryWeekend = Array.from({ length: 31 }, (_, index) => new Date(new Date().getFullYear(), new Date().getMonth(), index + 1))
  .find((day) => day.getMonth() === new Date().getMonth() && (day.getDay() === 0 || day.getDay() === 6) && Math.abs(day.getDate() - new Date().getDate()) > 3)!;
const calendarDays = [{
  date: today, weekday: new Date().getDay(), officialAvailable: true, isDayOff: true,
  dayOffType: "national_holiday" as const, isConnectedHoliday: true, connectedHolidayId: today,
  holidayName: "測試假日", festivalName: null, note: "測試假日",
}, {
  date: calendarDateKey(ordinaryWeekend), weekday: ordinaryWeekend.getDay(), officialAvailable: true, isDayOff: true,
  dayOffType: "weekend" as const, isConnectedHoliday: false, connectedHolidayId: null,
  holidayName: null, festivalName: null, note: null,
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
