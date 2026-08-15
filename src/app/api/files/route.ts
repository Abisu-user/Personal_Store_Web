import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFilesWorkspaceData } from "@/lib/files/data";
import { verifyFileUploadTicket } from "@/lib/security/file-upload-ticket";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const completeSchema = z.object({ ticket: z.string().min(1).max(3000), title: z.string().trim().min(1).max(300), description: z.string().trim().max(2000).optional(), categoryId: z.string().uuid().nullable().optional(), tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]) });
const deleteSchema = z.object({ id: z.string().uuid() });
const downloadSchema = z.string().uuid();
function jsonError(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function validateCategory(ownerId: string, categoryId: string | null | undefined) {
  if (!categoryId) return true;
  const { data } = await createAdminClient().from("categories").select("id").eq("id", categoryId).eq("owner_id", ownerId).maybeSingle(); return Boolean(data);
}
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
    const { data: signed, error: signError } = await admin.storage.from("vault-files").createSignedUrl(detail.storage_path, 60, { download: detail.original_filename }); if (signError || !signed) throw signError;
    return NextResponse.json({ url: signed.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("暫時無法準備下載。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return jsonError("Unauthorized", 401);
  const parsed = completeSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError("請檢查檔案欄位。", 400);
  const ticket = verifyFileUploadTicket(parsed.data.ticket); if (!ticket || ticket.ownerId !== context.userId) return jsonError("上傳憑證無效或已過期。", 400);
  if (!(await validateCategory(context.userId, parsed.data.categoryId))) return jsonError("找不到指定分類。", 400);
  let entryId: string | null = null;
  try {
    const admin = createAdminClient(); const fileName = ticket.storagePath.split("/")[1]; const { data: objectRows, error: objectError } = await admin.storage.from("vault-files").list(context.userId, { limit: 10, search: fileName });
    if (objectError || !objectRows?.some((item) => item.name === fileName)) return jsonError("找不到已上傳檔案，請重新上傳。", 400);
    const tags = await resolveTags(context.userId, parsed.data.tags); const { data: entry, error: entryError } = await admin.from("entries").insert({ owner_id: context.userId, kind: "file", title: parsed.data.title, description: parsed.data.description || null, category_id: parsed.data.categoryId ?? null }).select("id").single(); if (entryError) throw entryError;
    entryId = entry.id; const { error: detailError } = await admin.from("file_details").insert({ entry_id: entry.id, storage_path: ticket.storagePath, original_filename: ticket.originalFilename, mime_type: ticket.mimeType, byte_size: ticket.byteSize, sha256: `\\x${ticket.sha256}` }); if (detailError) throw detailError;
    await replaceTags(entry.id, tags.map((tag) => tag.id)); await admin.from("audit_logs").insert({ owner_id: context.userId, action: "file_uploaded", entry_id: entry.id, metadata: { byte_size: ticket.byteSize, mime_type: ticket.mimeType, tag_count: tags.length }, ip_hash: context.ipHash });
    return NextResponse.json({ id: entry.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    if (entryId) await createAdminClient().from("entries").delete().eq("id", entryId).eq("owner_id", context.userId);
    return jsonError("無法儲存檔案資訊，請稍後再試。", 503);
  }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return jsonError("Unauthorized", 401); const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError("Invalid request", 400);
  try {
    const admin = createAdminClient(); const { data, error } = await admin.from("entries").select("id, file_details(storage_path)").eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "file").maybeSingle(); const detail = data && (Array.isArray(data.file_details) ? data.file_details[0] : data.file_details); if (error) throw error; if (!data || !detail) return jsonError("找不到檔案。", 404);
    const { error: storageError } = await admin.storage.from("vault-files").remove([detail.storage_path]); if (storageError) throw storageError;
    const { error: deleteError } = await admin.from("entries").delete().eq("id", data.id).eq("owner_id", context.userId); if (deleteError) throw deleteError;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "file_deleted", metadata: {}, ip_hash: context.ipHash }); return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("無法刪除檔案，請稍後再試。", 503); }
}
