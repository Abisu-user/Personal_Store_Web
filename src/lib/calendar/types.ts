export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  color: string;
  updatedAt: string;
  eventDate: string;
  eventTime: string | null;
  allDay: boolean;
  recurrenceType: "none" | "daily" | "weekly" | "yearly";
  reminders: number[];
  allDayReminderTime: string;
  timeZone: string;
};

export type CalendarOccurrence = CalendarEvent & { occurrenceDate: string };

export type TaiwanCalendarDay = {
  date: string;
  weekday: number;
  officialAvailable: boolean;
  isDayOff: boolean;
  dayOffType: "weekend" | "national_holiday" | "makeup_holiday" | "special_holiday" | "workday" | "unknown";
  isConnectedHoliday: boolean;
  connectedHolidayId: string | null;
  holidayName: string | null;
  festivalName: string | null;
  note: string | null;
};

export type CalendarWorkspaceData = {
  events: CalendarEvent[];
  calendarDays: TaiwanCalendarDay[];
  range: { from: string; to: string };
};
