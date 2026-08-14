import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Note, NotesWorkspaceData } from "@/lib/notes/types";

/** Owner-scoped note collection for server-rendered pages and internal APIs. */
export const getNotesWorkspaceData = cache(async (ownerId: string): Promise<NotesWorkspaceData> => {
  const admin = createAdminClient();
  const [entriesResult, categoriesResult, tagsResult] = await Promise.all([
    admin
      .from("entries")
      .select("id, title, description, updated_at, categories(id, name), note_details(content_markdown, current_version), entry_tags(tags(id, name, color))")
      .eq("owner_id", ownerId)
      .eq("kind", "note")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(100),
    admin.from("categories").select("id, name, sort_order").eq("owner_id", ownerId).order("sort_order").order("name").limit(100),
    admin.from("tags").select("id, name, color").eq("owner_id", ownerId).order("name").limit(100),
  ]);

  if (entriesResult.error || categoriesResult.error || tagsResult.error) {
    throw new Error("Unable to load notes.");
  }

  const notes: Note[] = (entriesResult.data ?? []).flatMap((entry) => {
    const detail = Array.isArray(entry.note_details) ? entry.note_details[0] : entry.note_details;
    if (!detail) return [];

    return [{
      id: entry.id,
      title: entry.title,
      description: entry.description,
      content: detail.content_markdown,
      currentVersion: detail.current_version,
      category: Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories,
      tags: (entry.entry_tags ?? []).flatMap((item) =>
        Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : [],
      ),
      updatedAt: entry.updated_at,
    }];
  });

  return { notes, categories: categoriesResult.data ?? [], tags: tagsResult.data ?? [] };
});
