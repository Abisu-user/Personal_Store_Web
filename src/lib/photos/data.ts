import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PhotosWorkspaceData, StoredPhoto } from "@/lib/photos/types";

export const getPhotosWorkspaceData = cache(async (ownerId: string): Promise<PhotosWorkspaceData> => {
  const admin = createAdminClient();
  await admin.from("entries").delete().eq("owner_id", ownerId).eq("kind", "photo").lt("deleted_at", new Date(Date.now() - 30 * 86400000).toISOString());
  const [entriesResult, categoriesResult, foldersResult] = await Promise.all([
    admin.from("entries").select("id, title, description, updated_at, is_favorite, is_pinned, is_archived, deleted_at, categories(id, name), content_folders(id, name, is_visible), file_details(original_filename, mime_type, byte_size)").eq("owner_id", ownerId).eq("kind", "photo").order("updated_at", { ascending: false }).limit(200),
    admin.from("categories").select("id, name, sort_order").eq("owner_id", ownerId).eq("content_kind", "photo").order("sort_order").order("name").limit(100),
    admin.from("content_folders").select("id, name, sort_order, is_visible").eq("owner_id", ownerId).eq("content_kind", "photo").order("sort_order").order("name").limit(100),
  ]);
  if (entriesResult.error || categoriesResult.error || foldersResult.error) throw new Error("Unable to load photos.");
  const photos: StoredPhoto[] = (entriesResult.data ?? []).flatMap((entry) => {
    const detail = Array.isArray(entry.file_details) ? entry.file_details[0] : entry.file_details;
    if (!detail) return [];
    return [{ id: entry.id, title: entry.title, description: entry.description, originalFilename: detail.original_filename, mimeType: detail.mime_type, byteSize: Number(detail.byte_size), favorite: entry.is_favorite, pinned: entry.is_pinned, archived: entry.is_archived, deletedAt: entry.deleted_at, folder: Array.isArray(entry.content_folders) ? entry.content_folders[0] ?? null : entry.content_folders, category: Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories, imageUrl: `/api/photos?image=${entry.id}&v=${encodeURIComponent(entry.updated_at)}`, updatedAt: entry.updated_at }];
  });
  return { photos, categories: categoriesResult.data ?? [], folders: foldersResult.data ?? [] };
});
