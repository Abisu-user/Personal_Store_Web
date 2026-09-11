import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type EntryTaxonomyKind = "bookmark" | "note" | "code" | "file" | "photo" | "vault_item";
export type RelationMode = "add" | "remove" | "replace";
export type EntryTaxonomyLinks = { categories: { id: string; name: string }[]; folders: { id: string; name: string; is_visible: boolean }[] };

function unique(ids: readonly string[]) { return [...new Set(ids.filter(Boolean))]; }

export async function readEntryTaxonomyLinks(ownerId: string, folderType: "bookmark" | "content") {
  const admin = createAdminClient();
  const [categoryResult, folderResult] = await Promise.all([
    admin.from("entry_category_links").select("entry_id, categories(id,name)").eq("owner_id", ownerId),
    folderType === "bookmark"
      ? admin.from("bookmark_entry_folders").select("entry_id, bookmark_folders(id,name,is_visible)").eq("owner_id", ownerId)
      : admin.from("entry_content_folder_links").select("entry_id, content_folders(id,name,is_visible)").eq("owner_id", ownerId),
  ]);
  const links = new Map<string, EntryTaxonomyLinks>();
  const ensure = (entryId: string) => { const current = links.get(entryId) ?? { categories: [], folders: [] }; links.set(entryId, current); return current; };
  for (const row of categoryResult.data ?? []) { const values = Array.isArray(row.categories) ? row.categories : row.categories ? [row.categories] : []; ensure(row.entry_id).categories.push(...values); }
  for (const row of folderResult.data ?? []) {
    const record = row as unknown as { entry_id: string; bookmark_folders?: { id: string; name: string; is_visible: boolean } | { id: string; name: string; is_visible: boolean }[]; content_folders?: { id: string; name: string; is_visible: boolean } | { id: string; name: string; is_visible: boolean }[] };
    const relation = folderType === "bookmark" ? record.bookmark_folders : record.content_folders;
    const values = Array.isArray(relation) ? relation : relation ? [relation] : [];
    ensure(record.entry_id).folders.push(...values);
  }
  return links;
}

export async function validateEntryTaxonomy(ownerId: string, kind: EntryTaxonomyKind, categoryIds: readonly string[], folderIds: readonly string[], folderType: "bookmark" | "content") {
  const admin = createAdminClient();
  const categories = unique(categoryIds); const folders = unique(folderIds);
  if (categories.length) {
    const { data, error } = await admin.from("categories").select("id").eq("owner_id", ownerId).eq("content_kind", kind).in("id", categories);
    if (error || (data?.length ?? 0) !== categories.length) return false;
  }
  if (folders.length) {
    const query = folderType === "bookmark"
      ? admin.from("bookmark_folders").select("id").eq("owner_id", ownerId).in("id", folders)
      : admin.from("content_folders").select("id").eq("owner_id", ownerId).eq("content_kind", kind).in("id", folders);
    const { data, error } = await query;
    if (error || (data?.length ?? 0) !== folders.length) return false;
  }
  return true;
}

async function replaceLinks(table: string, ownerId: string, entryId: string, key: "category_id" | "folder_id", ids: readonly string[]) {
  const admin = createAdminClient();
  const { error: deleteError } = await admin.from(table).delete().eq("entry_id", entryId).eq("owner_id", ownerId);
  if (deleteError) throw deleteError;
  const values = unique(ids);
  if (values.length) {
    const { error } = await admin.from(table).insert(values.map((id) => ({ owner_id: ownerId, entry_id: entryId, [key]: id })));
    if (error) throw error;
  }
}

export async function replaceEntryTaxonomy(ownerId: string, entryId: string, kind: EntryTaxonomyKind, categoryIds: readonly string[], folderIds: readonly string[], folderType: "bookmark" | "content") {
  if (!(await validateEntryTaxonomy(ownerId, kind, categoryIds, folderIds, folderType))) throw new Error("INVALID_ENTRY_TAXONOMY");
  await Promise.all([
    replaceLinks("entry_category_links", ownerId, entryId, "category_id", categoryIds),
    replaceLinks(folderType === "bookmark" ? "bookmark_entry_folders" : "entry_content_folder_links", ownerId, entryId, "folder_id", folderIds),
  ]);
  const { error } = await createAdminClient().from("entries").update({ category_id: unique(categoryIds)[0] ?? null, ...(folderType === "bookmark" ? { bookmark_folder_id: unique(folderIds)[0] ?? null } : { content_folder_id: unique(folderIds)[0] ?? null }) }).eq("id", entryId).eq("owner_id", ownerId).eq("kind", kind);
  if (error) throw error;
}

async function mutateLinks(table: string, ownerId: string, entryIds: readonly string[], key: "category_id" | "folder_id", relationIds: readonly string[], mode: RelationMode) {
  const admin = createAdminClient(); const ids = unique(entryIds); const relations = unique(relationIds);
  if (mode === "replace") { const { error } = await admin.from(table).delete().eq("owner_id", ownerId).in("entry_id", ids); if (error) throw error; }
  if (mode === "remove" && relations.length) { const { error } = await admin.from(table).delete().eq("owner_id", ownerId).in("entry_id", ids).in(key, relations); if (error) throw error; return; }
  if ((mode === "add" || mode === "replace") && relations.length) {
    const rows = ids.flatMap((entryId) => relations.map((relationId) => ({ owner_id: ownerId, entry_id: entryId, [key]: relationId })));
    const { error } = await admin.from(table).upsert(rows, { onConflict: `entry_id,${key}` }); if (error) throw error;
  }
}

async function syncLegacyPrimaryLinks(ownerId: string, entryIds: readonly string[], folderType: "bookmark" | "content") {
  const admin = createAdminClient();
  const ids = unique(entryIds);
  const folderTable = folderType === "bookmark" ? "bookmark_entry_folders" : "entry_content_folder_links";
  const folderColumn = folderType === "bookmark" ? "bookmark_folder_id" : "content_folder_id";
  const [entryResult, categoryResult, folderResult] = await Promise.all([
    admin.from("entries").select(`id,category_id,${folderColumn}`).eq("owner_id", ownerId).in("id", ids),
    admin.from("entry_category_links").select("entry_id,category_id,created_at").eq("owner_id", ownerId).in("entry_id", ids).order("created_at", { ascending: true }),
    admin.from(folderTable).select("entry_id,folder_id,created_at").eq("owner_id", ownerId).in("entry_id", ids).order("created_at", { ascending: true }),
  ]);
  if (entryResult.error) throw entryResult.error;
  if (categoryResult.error) throw categoryResult.error;
  if (folderResult.error) throw folderResult.error;
  const categoryPrimary = new Map<string, string>();
  const folderPrimary = new Map<string, string>();
  for (const row of categoryResult.data ?? []) if (!categoryPrimary.has(row.entry_id)) categoryPrimary.set(row.entry_id, row.category_id);
  for (const row of folderResult.data ?? []) if (!folderPrimary.has(row.entry_id)) folderPrimary.set(row.entry_id, row.folder_id);
  await Promise.all((entryResult.data ?? []).map(async (entry) => {
    const record = entry as unknown as { id: string; category_id: string | null; bookmark_folder_id?: string | null; content_folder_id?: string | null };
    const nextCategoryId = categoryPrimary.get(record.id) ?? null;
    const currentFolderId = folderType === "bookmark" ? (record.bookmark_folder_id ?? null) : (record.content_folder_id ?? null);
    const nextFolderId = folderPrimary.get(record.id) ?? null;
    if (record.category_id === nextCategoryId && currentFolderId === nextFolderId) return;
    const { error } = await admin.from("entries").update({ category_id: nextCategoryId, [folderColumn]: nextFolderId }).eq("id", record.id).eq("owner_id", ownerId);
    if (error) throw error;
  }));
}

export async function mutateEntryTaxonomy(ownerId: string, entryIds: readonly string[], kind: EntryTaxonomyKind, categoryIds: readonly string[], folderIds: readonly string[], mode: RelationMode, folderType: "bookmark" | "content") {
  const ids = unique(entryIds);
  const { data: entries, error } = await createAdminClient().from("entries").select("id").eq("owner_id", ownerId).eq("kind", kind).is("deleted_at", null).in("id", ids);
  if (error || (entries?.length ?? 0) !== ids.length) throw new Error("ENTRY_NOT_FOUND");
  if (!(await validateEntryTaxonomy(ownerId, kind, categoryIds, folderIds, folderType))) throw new Error("INVALID_ENTRY_TAXONOMY");
  await Promise.all([
    mutateLinks("entry_category_links", ownerId, ids, "category_id", categoryIds, mode),
    mutateLinks(folderType === "bookmark" ? "bookmark_entry_folders" : "entry_content_folder_links", ownerId, ids, "folder_id", folderIds, mode),
  ]);
  await syncLegacyPrimaryLinks(ownerId, ids, folderType);
}
