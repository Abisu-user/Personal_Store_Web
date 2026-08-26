import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Note, NotesWorkspaceData } from "@/lib/notes/types";
import { getFolderLockState } from "@/lib/folder-locks/server";

/** Owner-scoped note collection for server-rendered pages and internal APIs. */
export async function getNotesWorkspaceData(ownerId: string): Promise<NotesWorkspaceData> {
  const admin = createAdminClient();
  const lockState = await getFolderLockState(ownerId, "note");
  await admin.from("entries").delete().eq("owner_id", ownerId).eq("kind", "note").lt("deleted_at", new Date(Date.now() - 30 * 86400000).toISOString());
  const [entriesResult, categoriesResult, foldersResult, tagsResult] = await Promise.all([
    admin.from("entries").select("id, title, description, updated_at, is_favorite, is_pinned, is_archived, deleted_at, cover_image_path, categories(id, name), content_folders(id, name, is_visible), note_details(content_markdown, current_version), entry_tags(tags(id, name, color))").eq("owner_id", ownerId).eq("kind", "note").order("updated_at", { ascending: false }).limit(100),
    admin.from("categories").select("id, name, sort_order, folder_id").eq("owner_id", ownerId).eq("content_kind", "note").order("sort_order").order("name").limit(100),
    admin.from("content_folders").select("id, name, sort_order, is_visible").eq("owner_id", ownerId).eq("content_kind", "note").order("sort_order").order("name").limit(100),
    admin.from("tags").select("id, name, color").eq("owner_id", ownerId).order("name").limit(100),
  ]);
  if (entriesResult.error || categoriesResult.error || foldersResult.error || tagsResult.error) throw new Error("Unable to load notes.");
  const entries = entriesResult.data ?? [];
  const notes: Note[] = entries.flatMap((entry) => {
    const detail = Array.isArray(entry.note_details) ? entry.note_details[0] : entry.note_details;
    if (!detail) return [];
    const folder = Array.isArray(entry.content_folders) ? entry.content_folders[0] ?? null : entry.content_folders;
    if (folder && lockState.locks.has(folder.id) && !lockState.unlockedFolderIds.has(folder.id)) return [];
    return [{ id: entry.id, title: entry.title, description: entry.description, content: detail.content_markdown, currentVersion: detail.current_version, favorite: entry.is_favorite, pinned: entry.is_pinned, archived: entry.is_archived, deletedAt: entry.deleted_at, folder, coverImageUrl: entry.cover_image_path ? `/api/content-covers?entry=${entry.id}&v=${encodeURIComponent(entry.updated_at)}` : null, category: Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories, tags: (entry.entry_tags ?? []).flatMap((item) => Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : []), updatedAt: entry.updated_at }];
  });
  return { notes, categories: categoriesResult.data ?? [], folders: (foldersResult.data ?? []).map((folder) => ({ ...folder, is_locked: lockState.locks.has(folder.id), lock_mode: lockState.locks.get(folder.id)?.password_mode ?? null })), tags: tagsResult.data ?? [] };
}
