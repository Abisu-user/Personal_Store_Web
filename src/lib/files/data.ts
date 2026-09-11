import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { FilesWorkspaceData, StoredFile } from "@/lib/files/types";
import { getFolderLockState } from "@/lib/folder-locks/server";
import { readEntryTaxonomyLinks } from "@/lib/content/entry-taxonomy";

export async function getFilesWorkspaceData(ownerId: string): Promise<FilesWorkspaceData> {
  const admin = createAdminClient();
  const lockState = await getFolderLockState(ownerId, "file");
  await admin.from("entries").delete().eq("owner_id", ownerId).eq("kind", "file").lt("deleted_at", new Date(Date.now() - 30 * 86400000).toISOString());
  const [entriesResult, categoriesResult, foldersResult, tagsResult] = await Promise.all([
    admin.from("entries").select("id, title, description, updated_at, is_favorite, is_pinned, is_archived, deleted_at, cover_image_path, cover_storage_object_id, categories(id, name), content_folders(id, name, is_visible), file_details(original_filename, mime_type, byte_size), entry_tags(tags(id, name, color))").eq("owner_id", ownerId).eq("kind", "file").order("updated_at", { ascending: false }).limit(100),
    admin.from("categories").select("id, name, sort_order, folder_id").eq("owner_id", ownerId).eq("content_kind", "file").order("sort_order").order("name").limit(100),
    admin.from("content_folders").select("id, name, sort_order, is_visible").eq("owner_id", ownerId).eq("content_kind", "file").order("sort_order").order("name").limit(100),
    admin.from("tags").select("id, name, color").eq("owner_id", ownerId).order("name").limit(100),
  ]);
  if (entriesResult.error || categoriesResult.error || foldersResult.error || tagsResult.error) throw new Error("Unable to load files.");
  const taxonomyLinks = await readEntryTaxonomyLinks(ownerId, "content");
  const entries = entriesResult.data ?? [];
  const files: StoredFile[] = entries.flatMap((entry) => {
    const detail = Array.isArray(entry.file_details) ? entry.file_details[0] : entry.file_details;
    if (!detail) return [];
    const folder = Array.isArray(entry.content_folders) ? entry.content_folders[0] ?? null : entry.content_folders;
    const category = Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories; const links = taxonomyLinks.get(entry.id); const linkedFolders = links?.folders.length ? links.folders : folder ? [folder] : []; const linkedCategories = links?.categories.length ? links.categories : category ? [category] : [];
    if (linkedFolders.some((item) => lockState.locks.has(item.id) && !lockState.unlockedFolderIds.has(item.id))) return [];
    return [{ id: entry.id, title: entry.title, description: entry.description, originalFilename: detail.original_filename, mimeType: detail.mime_type, byteSize: Number(detail.byte_size), favorite: entry.is_favorite, pinned: entry.is_pinned, archived: entry.is_archived, deletedAt: entry.deleted_at, folder: linkedFolders[0] ?? folder, folders: linkedFolders, coverImageUrl: entry.cover_image_path || entry.cover_storage_object_id ? `/api/content-covers?entry=${entry.id}&v=${encodeURIComponent(entry.updated_at)}` : null, category: linkedCategories[0] ?? category, categories: linkedCategories, tags: (entry.entry_tags ?? []).flatMap((item) => Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : []), updatedAt: entry.updated_at }];
  });
  return { files, categories: categoriesResult.data ?? [], folders: (foldersResult.data ?? []).map((folder) => ({ ...folder, is_locked: lockState.locks.has(folder.id), lock_mode: lockState.locks.get(folder.id)?.password_mode ?? null })), tags: tagsResult.data ?? [] };
}
