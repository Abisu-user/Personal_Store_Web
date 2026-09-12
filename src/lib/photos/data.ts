import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PhotosWorkspaceData, StoredPhoto } from "@/lib/photos/types";
import { getFolderLockState } from "@/lib/folder-locks/server";
import { readEntryTaxonomyLinks } from "@/lib/content/entry-taxonomy";

type SupabaseQueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function logQueryError(query: string, error: SupabaseQueryError | null, level: "error" | "warn" = "error") {
  if (!error) return;
  const context = {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
  if (level === "warn") console.warn("[photos:data] " + query + " failed", context);
  else console.error("[photos:data] " + query + " failed", context);
}

export async function getPhotosWorkspaceData(ownerId: string): Promise<PhotosWorkspaceData> {
  const admin = createAdminClient();
  const lockState = await getFolderLockState(ownerId, "photo");
  const cleanupResult = await admin.from("entries").delete().eq("owner_id", ownerId).eq("kind", "photo").lt("deleted_at", new Date(Date.now() - 30 * 86400000).toISOString());
  logQueryError("expired trash cleanup", cleanupResult.error, "warn");
  const [entriesResult, categoriesResult, foldersResult] = await Promise.all([
    admin.from("entries").select("id, title, description, updated_at, is_favorite, is_pinned, is_archived, deleted_at, categories:categories!entries_category_id_fkey(id, name), content_folders:content_folders!entries_content_folder_id_fkey(id, name, is_visible), file_details(original_filename, mime_type, byte_size)").eq("owner_id", ownerId).eq("kind", "photo").order("updated_at", { ascending: false }).limit(200),
    admin.from("categories").select("id, name, sort_order, folder_id").eq("owner_id", ownerId).eq("content_kind", "photo").order("sort_order").order("name").limit(100),
    admin.from("content_folders").select("id, name, sort_order, is_visible").eq("owner_id", ownerId).eq("content_kind", "photo").order("sort_order").order("name").limit(100),
  ]);
  const queryErrors = [
    ["entries select", entriesResult.error],
    ["categories select", categoriesResult.error],
    ["folders select", foldersResult.error],
  ] as const;
  queryErrors.forEach(([query, error]) => logQueryError(query, error));
  if (queryErrors.some(([, error]) => error)) throw new Error("Unable to load photos.");
  const taxonomyLinks = await readEntryTaxonomyLinks(ownerId, "content");
  const photos: StoredPhoto[] = (entriesResult.data ?? []).flatMap((entry) => {
    const detail = Array.isArray(entry.file_details) ? entry.file_details[0] : entry.file_details;
    if (!detail) return [];
    const folder = Array.isArray(entry.content_folders) ? entry.content_folders[0] ?? null : entry.content_folders;
    const category = Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories; const links = taxonomyLinks.get(entry.id); const linkedFolders = links?.folders.length ? links.folders : folder ? [folder] : []; const linkedCategories = links?.categories.length ? links.categories : category ? [category] : [];
    if (linkedFolders.some((item) => lockState.locks.has(item.id) && !lockState.unlockedFolderIds.has(item.id))) return [];
    return [{ id: entry.id, title: entry.title, description: entry.description, originalFilename: detail.original_filename, mimeType: detail.mime_type, byteSize: Number(detail.byte_size), favorite: entry.is_favorite, pinned: entry.is_pinned, archived: entry.is_archived, deletedAt: entry.deleted_at, folder: linkedFolders[0] ?? folder, folders: linkedFolders, category: linkedCategories[0] ?? category, categories: linkedCategories, imageUrl: `/api/photos?image=${entry.id}&v=${encodeURIComponent(entry.updated_at)}`, updatedAt: entry.updated_at }];
  });
  return { photos, categories: categoriesResult.data ?? [], folders: (foldersResult.data ?? []).map((folder) => ({ ...folder, is_locked: lockState.locks.has(folder.id), lock_mode: lockState.locks.get(folder.id)?.password_mode ?? null })) };
}
