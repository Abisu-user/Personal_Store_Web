export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  color: "indigo" | "blue" | "green" | "amber" | "rose";
  updatedAt: string;
};

export type CalendarWorkspaceData = { events: CalendarEvent[] };
