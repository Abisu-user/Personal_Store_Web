export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  color: "indigo" | "blue" | "green" | "amber" | "rose";
  updatedAt: string;
  eventDate: string;
  eventTime: string | null;
  allDay: boolean;
  recurrenceType: "none" | "yearly";
};

export type CalendarOccurrence = CalendarEvent & { occurrenceDate: string };

export type CalendarWorkspaceData = { events: CalendarEvent[]; range: { from: string; to: string } };
