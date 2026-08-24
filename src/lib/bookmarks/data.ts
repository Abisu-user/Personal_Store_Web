import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Bookmark, BookmarksWorkspaceData } from "@/lib/bookmarks/types";
import { getFolderLockState } from "@/lib/folder-locks/server";

/** Server-only collection read shared by the page and its internal API. */
export async function getBookmarksWorkspaceData(ownerId: string): Promise<BookmarksWorkspaceData> {
  const admin = createAdminClient();
  const lockState = await getFolderLockState(ownerId, "bookmark");
  // A collection read is also the fallback cleanup path when the scheduled job is unavailable.
  // This keeps a trashed entry out of the account on its first visit after 30 days.
  await admin.from("entries").delete().eq("owner_id", ownerId).eq("kind", "bookmark").lt("deleted_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  const [entriesResult, categoriesResult, foldersResult, tagsResult] = await Promise.all([
    admin
      .from("entries")
      .select("id, title, description, category_id, bookmark_folder_id, cover_image_path, is_favorite, is_pinned, is_archived, deleted_at, created_at, updated_at, categories(id, name), bookmark_folders(id, name, is_visible), bookmark_details(url, favicon_url, site_title, notes), entry_tags(tags(id, name, color))")
      .eq("owner_id", ownerId)
      .eq("kind", "bookmark")
      .order("updated_at", { ascending: false })
      .limit(100),
    admin.from("categories").select("id, name, sort_order").eq("owner_id", ownerId).eq("content_kind", "bookmark").order("sort_order").order("name").limit(100),
    admin.from("bookmark_folders").select("id, name, sort_order, is_visible").eq("owner_id", ownerId).order("sort_order").order("name").limit(100),
    admin.from("tags").select("id, name, color").eq("owner_id", ownerId).order("name").limit(100),
  ]);

  if (entriesResult.error || categoriesResult.error || foldersResult.error || tagsResult.error) {
    throw new Error("Unable to load bookmarks.");
  }

  const bookmarks: Bookmark[] = (entriesResult.data ?? []).flatMap((entry) => {
    const folder = Array.isArray(entry.bookmark_folders) ? entry.bookmark_folders[0] ?? null : entry.bookmark_folders;
    if (folder && lockState.locks.has(folder.id) && !lockState.unlockedFolderIds.has(folder.id)) return [];
    return [{
    id: entry.id,
    title: entry.title,
    description: entry.description,
    favorite: entry.is_favorite,
    pinned: entry.is_pinned,
    archived: entry.is_archived,
    deletedAt: entry.deleted_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    coverImageUrl: entry.cover_image_path ? `/api/content-covers?entry=${entry.id}&v=${encodeURIComponent(entry.updated_at)}` : null,
    category: Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories,
    folder,
    detail: Array.isArray(entry.bookmark_details) ? entry.bookmark_details[0] ?? null : entry.bookmark_details,
    tags: (entry.entry_tags ?? []).flatMap((item) =>
      Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : [],
    ),
    }];
  });

  return {
    bookmarks,
    categories: categoriesResult.data ?? [],
    folders: (foldersResult.data ?? []).map((folder) => ({ ...folder, is_locked: lockState.locks.has(folder.id), lock_mode: lockState.locks.get(folder.id)?.password_mode ?? null })),
    tags: tagsResult.data ?? [],
  };
}
