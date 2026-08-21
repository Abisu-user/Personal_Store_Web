import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CodeSnippet, CodeWorkspaceData } from "@/lib/code/types";

export const getCodeWorkspaceData = cache(async (ownerId: string): Promise<CodeWorkspaceData> => {
  const admin = createAdminClient();
  await admin.from("entries").delete().eq("owner_id", ownerId).eq("kind", "code").lt("deleted_at", new Date(Date.now() - 30 * 86400000).toISOString());
  const [entriesResult, categoriesResult, foldersResult, tagsResult] = await Promise.all([
    admin.from("entries").select("id, title, description, updated_at, is_favorite, is_pinned, is_archived, deleted_at, cover_image_path, categories(id, name), content_folders(id, name, is_visible), code_details(language, source_code), entry_tags(tags(id, name, color))").eq("owner_id", ownerId).eq("kind", "code").order("updated_at", { ascending: false }).limit(100),
    admin.from("categories").select("id, name, sort_order").eq("owner_id", ownerId).eq("content_kind", "code").order("sort_order").order("name").limit(100),
    admin.from("content_folders").select("id, name, sort_order, is_visible").eq("owner_id", ownerId).eq("content_kind", "code").order("sort_order").order("name").limit(100),
    admin.from("tags").select("id, name, color").eq("owner_id", ownerId).order("name").limit(100),
  ]);
  if (entriesResult.error || categoriesResult.error || foldersResult.error || tagsResult.error) throw new Error("Unable to load code snippets.");
  const entries = entriesResult.data ?? [];
  const snippets: CodeSnippet[] = entries.flatMap((entry) => {
    const detail = Array.isArray(entry.code_details) ? entry.code_details[0] : entry.code_details;
    if (!detail) return [];
    return [{ id: entry.id, title: entry.title, description: entry.description, language: detail.language, sourceCode: detail.source_code, favorite: entry.is_favorite, pinned: entry.is_pinned, archived: entry.is_archived, deletedAt: entry.deleted_at, folder: Array.isArray(entry.content_folders) ? entry.content_folders[0] ?? null : entry.content_folders, coverImageUrl: entry.cover_image_path ? `/api/content-covers?entry=${entry.id}&v=${encodeURIComponent(entry.updated_at)}` : null, category: Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories, tags: (entry.entry_tags ?? []).flatMap((item) => Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : []), updatedAt: entry.updated_at }];
  });
  return { snippets, categories: categoriesResult.data ?? [], folders: foldersResult.data ?? [], tags: tagsResult.data ?? [] };
});
