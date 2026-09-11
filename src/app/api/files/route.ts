import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFilesWorkspaceData } from "@/lib/files/data";
import { verifyFileUploadTicket } from "@/lib/security/file-upload-ticket";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStorageManager } from "@/lib/storage/server";
import { deleteCover, entryCoverFields, storedEntryCover, verifiedCover } from "@/lib/content/server";
import { mutateEntryTaxonomy, replaceEntryTaxonomy, validateEntryTaxonomy } from "@/lib/content/entry-taxonomy";

const completeSchema = z.object({ ticket: z.string().min(1).max(3000), title: z.string().trim().min(1).max(300), description: z.string().trim().max(2000).optional(), categoryId: z.string().uuid().nullable().optional(), contentFolderId: z.string().uuid().nullable().optional(), categoryIds: z.array(z.string().uuid()).max(30).optional(), folderIds: z.array(z.string().uuid()).max(30).optional(), favorite: z.boolean().optional().default(false), pinned: z.boolean().optional().default(false), archived: z.boolean().optional().default(false), coverTicket: z.string().max(3000).nullable().optional(), tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]) });
const updateSchema = completeSchema.omit({ ticket: true }).extend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });
const actionSchema = z.object({ id: z.string().uuid(), action: z.enum(["trash", "restore"]) });
const bulkOrganizeSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100), action: z.literal("organize"), folderIds: z.array(z.string().uuid()).max(30), categoryIds: z.array(z.string().uuid()).max(30), relationMode: z.enum(["add", "remove", "replace"]) });
const downloadSchema = z.string().uuid();
function jsonError(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function resolveTags(ownerId: string, tags: string[]) {
  const names = [...new Set(tags.map((tag) => tag.toLocaleLowerCase("en-US")))]; if (!names.length) return [] as { id: string }[];
  const { data, error } = await createAdminClient().from("tags").upsert(names.map((name) => ({ owner_id: ownerId, name })), { onConflict: "owner_id,name" }).select("id"); if (error) throw error; return data ?? [];
}
async function replaceTags(entryId: string, tagIds: string[]) {
  const admin = createAdminClient(); const { error: deleted } = await admin.from("entry_tags").delete().eq("entry_id", entryId); if (deleted) throw deleted;
  if (!tagIds.length) return; const { error } = await admin.from("entry_tags").insert(tagIds.map((tagId) => ({ entry_id: entryId, tag_id: tagId }))); if (error) throw error;
}

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return jsonError("Unauthorized", 401);
  const downloadId = request.nextUrl.searchParams.get("download");
  if (!downloadId) { try { return NextResponse.json(await getFilesWorkspaceData(context.userId), { headers: { "Cache-Control": "private, no-store" } }); } catch { return jsonError("Files are temporarily unavailable.", 503); } }
  if (!downloadSchema.safeParse(downloadId).success) return jsonError("Invalid request", 400);
  try {
    const admin = createAdminClient(); const { data, error } = await admin.from("entries").select("file_details(storage_path, original_filename)").eq("id", downloadId).eq("owner_id", context.userId).eq("kind", "file").is("deleted_at", null).maybeSingle();
    const detail = data && (Array.isArray(data.file_details) ? data.file_details[0] : data.file_details); if (error) throw error; if (!detail) return jsonError("找不到檔案。", 404);
    const { data: signed, error: signError } = await createStorageManager(admin).getSignedUrl("vault-files", detail.storage_path, 60, { download: detail.original_filename }); if (signError || !signed) throw signError;
    return NextResponse.json({ url: signed.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("暫時無法準備下載。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return jsonError("Unauthorized", 401);
  const parsed = completeSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError("請檢查檔案欄位。", 400);
  const ticket = verifyFileUploadTicket(parsed.data.ticket); if (!ticket || ticket.ownerId !== context.userId) return jsonError("上傳憑證無效或已過期。", 400);
  const categoryIds = parsed.data.categoryIds ?? (parsed.data.categoryId ? [parsed.data.categoryId] : []); const folderIds = parsed.data.folderIds ?? (parsed.data.contentFolderId ? [parsed.data.contentFolderId] : []); if (!(await validateEntryTaxonomy(context.userId, "file", categoryIds, folderIds, "content"))) return jsonError("找不到指定分類或資料夾。", 400);
  const cover = await verifiedCover(context.userId, parsed.data.coverTicket); if (cover === undefined) return jsonError("封面上傳已過期，請重新選擇圖片。", 400);
  let entryId: string | null = null;
  try {
    const admin = createAdminClient(); const fileName = ticket.storagePath.split("/")[1]; const { data: objectRows, error: objectError } = await createStorageManager(admin).list("vault-files", context.userId, { limit: 10, search: fileName });
    if (objectError || !objectRows?.some((item) => item.name === fileName)) return jsonError("找不到已上傳檔案，請重新上傳。", 400);
    const tags = await resolveTags(context.userId, parsed.data.tags); const { data: entry, error: entryError } = await admin.from("entries").insert({ owner_id: context.userId, kind: "file", title: parsed.data.title, description: parsed.data.description || null, category_id: categoryIds[0] ?? null, content_folder_id: folderIds[0] ?? null, is_favorite: parsed.data.favorite, is_pinned: parsed.data.pinned && !parsed.data.archived, is_archived: parsed.data.archived, ...entryCoverFields(cover) }).select("id").single(); if (entryError) throw entryError;
    entryId = entry.id; const { error: detailError } = await admin.from("file_details").insert({ entry_id: entry.id, storage_path: ticket.storagePath, original_filename: ticket.originalFilename, mime_type: ticket.mimeType, byte_size: ticket.byteSize, sha256: `\\x${ticket.sha256}` }); if (detailError) throw detailError;
    await replaceTags(entry.id, tags.map((tag) => tag.id)); await replaceEntryTaxonomy(context.userId, entry.id, "file", categoryIds, folderIds, "content"); await admin.from("audit_logs").insert({ owner_id: context.userId, action: "file_uploaded", entry_id: entry.id, metadata: { byte_size: ticket.byteSize, mime_type: ticket.mimeType, tag_count: tags.length }, ip_hash: context.ipHash });
    return NextResponse.json({ id: entry.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    if (entryId) await createAdminClient().from("entries").delete().eq("id", entryId).eq("owner_id", context.userId);
    return jsonError("無法儲存檔案資訊，請稍後再試。", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return jsonError("Unauthorized", 401);
  const requestBody = await request.json().catch(() => null); const action = actionSchema.safeParse(requestBody);
  const organize = bulkOrganizeSchema.safeParse(requestBody);
  if (organize.success) {
    try { await mutateEntryTaxonomy(context.userId, organize.data.ids, "file", organize.data.categoryIds, organize.data.folderIds, organize.data.relationMode, "content"); return NextResponse.json({ ok: true }); } catch { return jsonError("無法整理選取的檔案。", 503); }
  }
  if (action.success) {
    try { const admin = createAdminClient(); const { data: current, error } = await admin.from("entries").select("id, deleted_at").eq("id", action.data.id).eq("owner_id", context.userId).eq("kind", "file").maybeSingle(); if (error) throw error; if (!current) return jsonError("找不到檔案。", 404); const updates = action.data.action === "trash" ? current.deleted_at ? null : { deleted_at: new Date().toISOString(), is_pinned: false } : current.deleted_at ? { deleted_at: null } : null; if (!updates) return jsonError("此檔案目前無法執行這項操作。", 409); const { error: updateError } = await admin.from("entries").update(updates).eq("id", current.id).eq("owner_id", context.userId); if (updateError) throw updateError; return NextResponse.json({ ok: true }); } catch { return jsonError("無法更新檔案狀態。", 503); }
  }
  const parsed = updateSchema.safeParse(requestBody); if (!parsed.success) return jsonError("請檢查檔案欄位。", 400);
  const categoryIds = parsed.data.categoryIds ?? (parsed.data.categoryId ? [parsed.data.categoryId] : []); const folderIds = parsed.data.folderIds ?? (parsed.data.contentFolderId ? [parsed.data.contentFolderId] : []); if (!(await validateEntryTaxonomy(context.userId, "file", categoryIds, folderIds, "content"))) return jsonError("找不到指定分類或資料夾。", 400);
  const newCover = await verifiedCover(context.userId, parsed.data.coverTicket); if (newCover === undefined) return jsonError("封面上傳已過期，請重新選擇圖片。", 400);
  try { const admin = createAdminClient(); const { data: existing, error } = await admin.from("entries").select("id, cover_image_path, cover_storage_object_id").eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "file").is("deleted_at", null).maybeSingle(); if (error) throw error; if (!existing) return jsonError("找不到檔案。", 404); const tags = await resolveTags(context.userId, parsed.data.tags); const { error: updateError } = await admin.from("entries").update({ title: parsed.data.title, description: parsed.data.description || null, category_id: categoryIds[0] ?? null, content_folder_id: folderIds[0] ?? null, is_favorite: parsed.data.favorite, is_pinned: parsed.data.pinned && !parsed.data.archived, is_archived: parsed.data.archived, ...(newCover ? entryCoverFields(newCover) : {}) }).eq("id", existing.id).eq("owner_id", context.userId); if (updateError) throw updateError; await replaceTags(existing.id, tags.map((tag) => tag.id)); await replaceEntryTaxonomy(context.userId, existing.id, "file", categoryIds, folderIds, "content"); if (newCover) await deleteCover(context.userId, storedEntryCover(existing)); return NextResponse.json({ ok: true }); } catch { return jsonError("無法儲存檔案。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return jsonError("Unauthorized", 401); const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError("Invalid request", 400);
  try {
    const admin = createAdminClient(); const { data, error } = await admin.from("entries").select("id, cover_image_path, cover_storage_object_id, file_details(storage_path)").eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "file").not("deleted_at", "is", null).maybeSingle(); const detail = data && (Array.isArray(data.file_details) ? data.file_details[0] : data.file_details); if (error) throw error; if (!data || !detail) return jsonError("請先將檔案移至垃圾桶。", 404);
    const { error: storageError } = await createStorageManager(admin).delete("vault-files", [detail.storage_path]); if (storageError) throw storageError;
    await deleteCover(context.userId, storedEntryCover(data));
    const { error: deleteError } = await admin.from("entries").delete().eq("id", data.id).eq("owner_id", context.userId); if (deleteError) throw deleteError;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "file_deleted", metadata: {}, ip_hash: context.ipHash }); return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("無法刪除檔案，請稍後再試。", 503); }
}
