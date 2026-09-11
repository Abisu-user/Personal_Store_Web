import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCodeWorkspaceData } from "@/lib/code/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";
import { deleteCover, entryCoverFields, storedEntryCover, verifiedCover } from "@/lib/content/server";
import { mutateEntryTaxonomy, replaceEntryTaxonomy, validateEntryTaxonomy } from "@/lib/content/entry-taxonomy";

const snippetSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional(),
  language: z.string().trim().min(1).max(50),
  sourceCode: z.string().min(1).max(100_000),
  categoryId: z.string().uuid().nullable().optional(),
  contentFolderId: z.string().uuid().nullable().optional(),
  categoryIds: z.array(z.string().uuid()).max(30).optional(),
  folderIds: z.array(z.string().uuid()).max(30).optional(),
  favorite: z.boolean().optional().default(false),
  pinned: z.boolean().optional().default(false),
  archived: z.boolean().optional().default(false),
  coverTicket: z.string().max(3000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
});
const updateSchema = snippetSchema.extend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });
const actionSchema = z.object({ id: z.string().uuid(), action: z.enum(["trash", "restore"]) });
const bulkOrganizeSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100), action: z.literal("organize"), folderIds: z.array(z.string().uuid()).max(30), categoryIds: z.array(z.string().uuid()).max(30), relationMode: z.enum(["add", "remove", "replace"]) });
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function resolveTags(ownerId: string, tags: string[]) {
  const names = [...new Set(tags.map((tag) => tag.toLocaleLowerCase("en-US")))];
  if (!names.length) return [] as { id: string }[];
  const { data, error } = await createAdminClient().from("tags").upsert(names.map((name) => ({ owner_id: ownerId, name })), { onConflict: "owner_id,name" }).select("id");
  if (error) throw error;
  return data ?? [];
}

async function replaceTags(entryId: string, tagIds: string[]) {
  const admin = createAdminClient();
  const { error: deleteError } = await admin.from("entry_tags").delete().eq("entry_id", entryId);
  if (deleteError) throw deleteError;
  if (!tagIds.length) return;
  const { error: insertError } = await admin.from("entry_tags").insert(tagIds.map((tagId) => ({ entry_id: entryId, tag_id: tagId })));
  if (insertError) throw insertError;
}

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  try { return NextResponse.json(await getCodeWorkspaceData(context.userId), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return jsonError("Code snippets are temporarily unavailable.", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = snippetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("請檢查程式碼片段欄位。", 400);
  const categoryIds = parsed.data.categoryIds ?? (parsed.data.categoryId ? [parsed.data.categoryId] : []); const folderIds = parsed.data.folderIds ?? (parsed.data.contentFolderId ? [parsed.data.contentFolderId] : []);
  if (!(await validateEntryTaxonomy(context.userId, "code", categoryIds, folderIds, "content"))) return jsonError("找不到指定分類或資料夾。", 400);
  const cover = await verifiedCover(context.userId, parsed.data.coverTicket);
  if (cover === undefined) return jsonError("封面上傳已過期，請重新選擇圖片。", 400);
  let entryId: string | null = null;
  try {
    const admin = createAdminClient(); const tags = await resolveTags(context.userId, parsed.data.tags);
    const { data: entry, error: entryError } = await admin.from("entries").insert({ owner_id: context.userId, kind: "code", title: parsed.data.title, description: parsed.data.description || null, category_id: categoryIds[0] ?? null, content_folder_id: folderIds[0] ?? null, is_favorite: parsed.data.favorite, is_pinned: parsed.data.pinned && !parsed.data.archived, is_archived: parsed.data.archived, ...entryCoverFields(cover) }).select("id").single();
    if (entryError) throw entryError;
    entryId = entry.id;
    const { error: detailError } = await admin.from("code_details").insert({ entry_id: entry.id, language: parsed.data.language, source_code: parsed.data.sourceCode });
    if (detailError) throw detailError;
    await replaceTags(entry.id, tags.map((tag) => tag.id));
    await replaceEntryTaxonomy(context.userId, entry.id, "code", categoryIds, folderIds, "content");
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "code_created", entry_id: entry.id, metadata: { language: parsed.data.language, tag_count: tags.length }, ip_hash: context.ipHash });
    return NextResponse.json({ id: entry.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    if (entryId) await createAdminClient().from("entries").delete().eq("id", entryId).eq("owner_id", context.userId);
    return jsonError("無法建立程式碼片段，請稍後再試。", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const requestBody = await request.json().catch(() => null);
  const organize = bulkOrganizeSchema.safeParse(requestBody);
  if (organize.success) {
    try { await mutateEntryTaxonomy(context.userId, organize.data.ids, "code", organize.data.categoryIds, organize.data.folderIds, organize.data.relationMode, "content"); return NextResponse.json({ ok: true }); } catch { return jsonError("無法整理選取的程式碼。", 503); }
  }
  const action = actionSchema.safeParse(requestBody);
  if (action.success) {
    try {
      const admin = createAdminClient(); const { data: current, error } = await admin.from("entries").select("id, deleted_at").eq("id", action.data.id).eq("owner_id", context.userId).eq("kind", "code").maybeSingle();
      if (error) throw error; if (!current) return jsonError("找不到程式碼片段。", 404);
      const updates = action.data.action === "trash" ? current.deleted_at ? null : { deleted_at: new Date().toISOString(), is_pinned: false } : current.deleted_at ? { deleted_at: null } : null;
      if (!updates) return jsonError("此程式碼目前無法執行這項操作。", 409);
      const { error: updateError } = await admin.from("entries").update(updates).eq("id", current.id).eq("owner_id", context.userId); if (updateError) throw updateError;
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    } catch { return jsonError("無法更新程式碼狀態。", 503); }
  }
  const parsed = updateSchema.safeParse(requestBody);
  if (!parsed.success) return jsonError("請檢查程式碼片段欄位。", 400);
  const categoryIds = parsed.data.categoryIds ?? (parsed.data.categoryId ? [parsed.data.categoryId] : []); const folderIds = parsed.data.folderIds ?? (parsed.data.contentFolderId ? [parsed.data.contentFolderId] : []);
  if (!(await validateEntryTaxonomy(context.userId, "code", categoryIds, folderIds, "content"))) return jsonError("找不到指定分類或資料夾。", 400);
  const newCover = await verifiedCover(context.userId, parsed.data.coverTicket);
  if (newCover === undefined) return jsonError("封面上傳已過期，請重新選擇圖片。", 400);
  try {
    const admin = createAdminClient(); const tags = await resolveTags(context.userId, parsed.data.tags);
    const { data: existing, error: existingError } = await admin.from("entries").select("id, cover_image_path, cover_storage_object_id").eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "code").is("deleted_at", null).maybeSingle();
    if (existingError) throw existingError; if (!existing) return jsonError("找不到程式碼片段。", 404);
    const { data: entry, error: entryError } = await admin.from("entries").update({ title: parsed.data.title, description: parsed.data.description || null, category_id: categoryIds[0] ?? null, content_folder_id: folderIds[0] ?? null, is_favorite: parsed.data.favorite, is_pinned: parsed.data.pinned && !parsed.data.archived, is_archived: parsed.data.archived, ...(newCover ? entryCoverFields(newCover) : {}) }).eq("id", existing.id).eq("owner_id", context.userId).eq("kind", "code").select("id").maybeSingle();
    if (entryError) throw entryError;
    if (!entry) return jsonError("找不到程式碼片段。", 404);
    if (newCover) await deleteCover(context.userId, storedEntryCover(existing));
    const { error: detailError } = await admin.from("code_details").update({ language: parsed.data.language, source_code: parsed.data.sourceCode }).eq("entry_id", entry.id);
    if (detailError) throw detailError;
    await replaceTags(entry.id, tags.map((tag) => tag.id));
    await replaceEntryTaxonomy(context.userId, entry.id, "code", categoryIds, folderIds, "content");
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "code_updated", entry_id: entry.id, metadata: { language: parsed.data.language, tag_count: tags.length }, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("無法儲存程式碼片段，請稍後再試。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request", 400);
  try {
    const admin = createAdminClient();
    const { data: entry, error } = await admin.from("entries").select("id, cover_image_path, cover_storage_object_id").eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "code").not("deleted_at", "is", null).maybeSingle();
    if (error) throw error;
    if (!entry) return jsonError("請先將程式碼移至垃圾桶。", 404);
    await deleteCover(context.userId, storedEntryCover(entry));
    const { error: deleteError } = await admin.from("entries").delete().eq("id", entry.id).eq("owner_id", context.userId); if (deleteError) throw deleteError;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "code_deleted", metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("無法刪除程式碼片段，請稍後再試。", 503); }
}
