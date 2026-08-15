import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FilesWorkspaceData, StoredFile } from "@/lib/files/types";

export const getFilesWorkspaceData = cache(async (ownerId: string): Promise<FilesWorkspaceData> => {
  const admin = createAdminClient();
  const [entriesResult, categoriesResult, tagsResult] = await Promise.all([
    admin.from("entries").select("id, title, description, updated_at, categories(id, name), file_details(original_filename, mime_type, byte_size), entry_tags(tags(id, name, color))").eq("owner_id", ownerId).eq("kind", "file").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100),
    admin.from("categories").select("id, name, sort_order").eq("owner_id", ownerId).order("sort_order").order("name").limit(100),
    admin.from("tags").select("id, name, color").eq("owner_id", ownerId).order("name").limit(100),
  ]);
  if (entriesResult.error || categoriesResult.error || tagsResult.error) throw new Error("Unable to load files.");
  const files: StoredFile[] = (entriesResult.data ?? []).flatMap((entry) => {
    const detail = Array.isArray(entry.file_details) ? entry.file_details[0] : entry.file_details;
    if (!detail) return [];
    return [{ id: entry.id, title: entry.title, description: entry.description, originalFilename: detail.original_filename, mimeType: detail.mime_type, byteSize: Number(detail.byte_size), category: Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories, tags: (entry.entry_tags ?? []).flatMap((item) => Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : []), updatedAt: entry.updated_at }];
  });
  return { files, categories: categoriesResult.data ?? [], tags: tagsResult.data ?? [] };
});
