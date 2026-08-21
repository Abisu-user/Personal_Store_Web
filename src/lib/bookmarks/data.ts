import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Bookmark, BookmarksWorkspaceData } from "@/lib/bookmarks/types";

/** Server-only collection read shared by the page and its internal API. */
export async function getBookmarksWorkspaceData(ownerId: string): Promise<BookmarksWorkspaceData> {
  const admin = createAdminClient();
  // A collection read is also the fallback cleanup path when the scheduled job is unavailable.
  // This keeps a trashed entry out of the account on its first visit after 30 days.
  await admin.from("entries").delete().eq("owner_id", ownerId).eq("kind", "bookmark").lt("deleted_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  const [entriesResult, categoriesResult, foldersResult, tagsResult] = await Promise.all([
    admin
      .from("entries")
      .select("id, title, description, category_id, bookmark_folder_id, is_favorite, is_pinned, is_archived, deleted_at, created_at, updated_at, categories(id, name), bookmark_folders(id, name, is_visible), bookmark_details(url, favicon_url, site_title, notes), entry_tags(tags(id, name, color))")
      .eq("owner_id", ownerId)
      .eq("kind", "bookmark")
      .order("updated_at", { ascending: false })
      .limit(100),
    admin.from("categories").select("id, name, sort_order").eq("owner_id", ownerId).order("sort_order").order("name").limit(100),
    admin.from("bookmark_folders").select("id, name, sort_order, is_visible").eq("owner_id", ownerId).order("sort_order").order("name").limit(100),
    admin.from("tags").select("id, name, color").eq("owner_id", ownerId).order("name").limit(100),
  ]);

  if (entriesResult.error || categoriesResult.error || foldersResult.error || tagsResult.error) {
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
    folder: Array.isArray(entry.bookmark_folders) ? entry.bookmark_folders[0] ?? null : entry.bookmark_folders,
    detail: Array.isArray(entry.bookmark_details) ? entry.bookmark_details[0] ?? null : entry.bookmark_details,
    tags: (entry.entry_tags ?? []).flatMap((item) =>
      Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : [],
    ),
  }));

  return {
    bookmarks,
    categories: categoriesResult.data ?? [],
    folders: foldersResult.data ?? [],
    tags: tagsResult.data ?? [],
  };
}
