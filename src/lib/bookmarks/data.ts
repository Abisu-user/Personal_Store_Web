import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Bookmark, BookmarksWorkspaceData } from "@/lib/bookmarks/types";

/** Server-only collection read shared by the page and its internal API. */
export const getBookmarksWorkspaceData = cache(async (ownerId: string): Promise<BookmarksWorkspaceData> => {
  const admin = createAdminClient();
  const [entriesResult, categoriesResult, tagsResult] = await Promise.all([
    admin
      .from("entries")
      .select("id, title, description, category_id, is_favorite, is_pinned, is_archived, deleted_at, created_at, updated_at, categories(id, name), bookmark_details(url, favicon_url, site_title, notes), entry_tags(tags(id, name, color))")
      .eq("owner_id", ownerId)
      .eq("kind", "bookmark")
      .order("updated_at", { ascending: false })
      .limit(100),
    admin.from("categories").select("id, name, sort_order").eq("owner_id", ownerId).order("sort_order").order("name").limit(100),
    admin.from("tags").select("id, name, color").eq("owner_id", ownerId).order("name").limit(100),
  ]);

  if (entriesResult.error || categoriesResult.error || tagsResult.error) {
    throw new Error("Unable to load bookmarks.");
  }

  const bookmarks: Bookmark[] = (entriesResult.data ?? []).map((entry) => ({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    favorite: entry.is_favorite,
    pinned: entry.is_pinned,
    archived: entry.is_archived,
    deletedAt: entry.deleted_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    category: Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories,
    detail: Array.isArray(entry.bookmark_details) ? entry.bookmark_details[0] ?? null : entry.bookmark_details,
    tags: (entry.entry_tags ?? []).flatMap((item) =>
      Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : [],
    ),
  }));

  return {
    bookmarks,
    categories: categoriesResult.data ?? [],
    tags: tagsResult.data ?? [],
  };
});
