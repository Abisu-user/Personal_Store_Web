import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CodeSnippet, CodeWorkspaceData } from "@/lib/code/types";

export const getCodeWorkspaceData = cache(async (ownerId: string): Promise<CodeWorkspaceData> => {
  const admin = createAdminClient();
  const [entriesResult, categoriesResult, tagsResult] = await Promise.all([
    admin.from("entries").select("id, title, description, updated_at, categories(id, name), code_details(language, source_code), entry_tags(tags(id, name, color))").eq("owner_id", ownerId).eq("kind", "code").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100),
    admin.from("categories").select("id, name, sort_order").eq("owner_id", ownerId).order("sort_order").order("name").limit(100),
    admin.from("tags").select("id, name, color").eq("owner_id", ownerId).order("name").limit(100),
  ]);
  if (entriesResult.error || categoriesResult.error || tagsResult.error) throw new Error("Unable to load code snippets.");

  const snippets: CodeSnippet[] = (entriesResult.data ?? []).flatMap((entry) => {
    const detail = Array.isArray(entry.code_details) ? entry.code_details[0] : entry.code_details;
    if (!detail) return [];
    return [{
      id: entry.id,
      title: entry.title,
      description: entry.description,
      language: detail.language,
      sourceCode: detail.source_code,
      category: Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories,
      tags: (entry.entry_tags ?? []).flatMap((item) => Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : []),
      updatedAt: entry.updated_at,
    }];
  });
  return { snippets, categories: categoriesResult.data ?? [], tags: tagsResult.data ?? [] };
});
