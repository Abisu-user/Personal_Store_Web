import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CalendarEvent, CalendarWorkspaceData } from "@/lib/calendar/types";

export const getCalendarWorkspaceData = cache(async (ownerId: string): Promise<CalendarWorkspaceData> => {
  const { data, error } = await createAdminClient()
    .from("calendar_events")
    .select("id, title, description, starts_at, ends_at, color, updated_at")
    .eq("owner_id", ownerId)
    .order("starts_at")
    .limit(500);

  if (error) throw new Error("Unable to load calendar events.");

  return {
    events: (data ?? []).map((event): CalendarEvent => ({
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      color: event.color as CalendarEvent["color"],
      updatedAt: event.updated_at,
    })),
  };
});
