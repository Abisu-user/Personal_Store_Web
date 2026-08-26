import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPhotosWorkspaceData } from "@/lib/photos/data";
import { verifyFileUploadTicket } from "@/lib/security/file-upload-ticket";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateContentFolder } from "@/lib/content/server";

const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const;
const imageId = z.string().uuid();
const completeSchema = z.object({ ticket: z.string().min(1).max(3000), title: z.string().trim().min(1).max(300), description: z.string().trim().max(2000).optional(), categoryId: z.string().uuid().nullable().optional(), contentFolderId: z.string().uuid().nullable().optional(), favorite: z.boolean().optional().default(false), pinned: z.boolean().optional().default(false), archived: z.boolean().optional().default(false) });
const updateSchema = completeSchema.omit({ ticket: true }).extend({ id: z.string().uuid() });
const actionSchema = z.object({ id: z.string().uuid(), action: z.enum(["trash", "restore"]) });
const bulkOrganizeSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100), action: z.literal("organize"), contentFolderId: z.string().uuid().nullable().optional(), categoryId: z.string().uuid().nullable().optional() });
const deleteSchema = z.object({ id: z.string().uuid() });
function error(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function validateCategory(ownerId: string, categoryId: string | null | undefined, folderId: string | null | undefined) {
  if (!categoryId) return true;
  const { data } = await createAdminClient().from("categories").select("id, folder_id").eq("id", categoryId).eq("owner_id", ownerId).eq("content_kind", "photo").maybeSingle();
  return Boolean(data) && (data?.folder_id ?? null) === (folderId ?? null);
}

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const requestedImage = request.nextUrl.searchParams.get("image");
  if (!requestedImage) { try { return NextResponse.json(await getPhotosWorkspaceData(context.userId), { headers: { "Cache-Control": "private, no-store" } }); } catch { return error("目前無法讀取照片。", 503); } }
  if (!imageId.safeParse(requestedImage).success) return error("Invalid request", 400);
  try {
    const admin = createAdminClient();
    const { data, error: queryError } = await admin.from("entries").select("file_details(storage_path, mime_type)").eq("id", requestedImage).eq("owner_id", context.userId).eq("kind", "photo").maybeSingle();
    const detail = data && (Array.isArray(data.file_details) ? data.file_details[0] : data.file_details); if (queryError) throw queryError;
    if (!detail) return error("找不到照片。", 404);
    const { data: object, error: objectError } = await admin.storage.from("vault-files").download(detail.storage_path);
    if (objectError || !object) throw objectError;
    return new NextResponse(object, { headers: { "Content-Type": detail.mime_type || object.type || "image/jpeg", "Cache-Control": "private, no-store" } });
  } catch { return error("暫時無法讀取照片。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const parsed = completeSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("請檢查照片欄位。", 400);
  const ticket = verifyFileUploadTicket(parsed.data.ticket);
  if (!ticket || ticket.ownerId !== context.userId || !ticket.storagePath.startsWith(`${context.userId}/photos/`) || !imageTypes.includes(ticket.mimeType as typeof imageTypes[number])) return error("照片上傳憑證無效或已過期。", 400);
  if (!(await validateCategory(context.userId, parsed.data.categoryId, parsed.data.contentFolderId)) || !(await validateContentFolder(context.userId, "photo", parsed.data.contentFolderId))) return error("找不到指定分類或資料夾。", 400);
  let entryId: string | null = null;
  try {
    const admin = createAdminClient(); const fileName = ticket.storagePath.split("/").at(-1) ?? "";
    const { data: objectRows, error: objectError } = await admin.storage.from("vault-files").list(`${context.userId}/photos`, { limit: 20, search: fileName });
    if (objectError || !objectRows?.some((item) => item.name === fileName)) return error("找不到已上傳照片，請重新選擇。", 400);
    const { data: entry, error: entryError } = await admin.from("entries").insert({ owner_id: context.userId, kind: "photo", title: parsed.data.title, description: parsed.data.description || null, category_id: parsed.data.categoryId ?? null, content_folder_id: parsed.data.contentFolderId ?? null, is_favorite: parsed.data.favorite, is_pinned: parsed.data.pinned && !parsed.data.archived, is_archived: parsed.data.archived }).select("id").single();
    if (entryError) throw entryError; entryId = entry.id;
    const { error: detailError } = await admin.from("file_details").insert({ entry_id: entry.id, storage_path: ticket.storagePath, original_filename: ticket.originalFilename, mime_type: ticket.mimeType, byte_size: ticket.byteSize, sha256: `\\x${ticket.sha256}` });
    if (detailError) throw detailError;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "photo_uploaded", entry_id: entry.id, metadata: { byte_size: ticket.byteSize, mime_type: ticket.mimeType }, ip_hash: context.ipHash });
    return NextResponse.json({ id: entry.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    if (entryId) await createAdminClient().from("entries").delete().eq("id", entryId).eq("owner_id", context.userId);
    return error("無法儲存照片，請稍後再試。", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const body = await request.json().catch(() => null); const action = actionSchema.safeParse(body);
  const organize = bulkOrganizeSchema.safeParse(body);
  if (organize.success) {
    if (!(await validateContentFolder(context.userId, "photo", organize.data.contentFolderId)) || !(await validateCategory(context.userId, organize.data.categoryId, organize.data.contentFolderId))) return error("找不到指定分類或資料夾。", 400);
    try { const { error: updateError } = await createAdminClient().from("entries").update({ content_folder_id: organize.data.contentFolderId ?? null, category_id: organize.data.categoryId ?? null }).in("id", organize.data.ids).eq("owner_id", context.userId).eq("kind", "photo").is("deleted_at", null); if (updateError) throw updateError; return NextResponse.json({ ok: true }); } catch { return error("無法移動選取的照片。", 503); }
  }
  if (action.success) {
    try { const admin = createAdminClient(); const { data, error: queryError } = await admin.from("entries").select("id, deleted_at").eq("id", action.data.id).eq("owner_id", context.userId).eq("kind", "photo").maybeSingle(); if (queryError) throw queryError; if (!data) return error("找不到照片。", 404); const updates = action.data.action === "trash" ? data.deleted_at ? null : { deleted_at: new Date().toISOString(), is_pinned: false } : data.deleted_at ? { deleted_at: null } : null; if (!updates) return error("此照片目前無法執行這項操作。", 409); const { error: updateError } = await admin.from("entries").update(updates).eq("id", data.id).eq("owner_id", context.userId); if (updateError) throw updateError; return NextResponse.json({ ok: true }); } catch { return error("無法更新照片狀態。", 503); }
  }
  const parsed = updateSchema.safeParse(body); if (!parsed.success) return error("請檢查照片欄位。", 400);
  if (!(await validateCategory(context.userId, parsed.data.categoryId, parsed.data.contentFolderId)) || !(await validateContentFolder(context.userId, "photo", parsed.data.contentFolderId))) return error("找不到指定分類或資料夾。", 400);
  try { const { data, error: queryError } = await createAdminClient().from("entries").update({ title: parsed.data.title, description: parsed.data.description || null, category_id: parsed.data.categoryId ?? null, content_folder_id: parsed.data.contentFolderId ?? null, is_favorite: parsed.data.favorite, is_pinned: parsed.data.pinned && !parsed.data.archived, is_archived: parsed.data.archived }).eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "photo").is("deleted_at", null).select("id").maybeSingle(); if (queryError) throw queryError; if (!data) return error("找不到照片。", 404); return NextResponse.json({ ok: true }); } catch { return error("無法儲存照片資訊。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("Invalid request", 400);
  try { const admin = createAdminClient(); const { data, error: queryError } = await admin.from("entries").select("id, file_details(storage_path)").eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "photo").not("deleted_at", "is", null).maybeSingle(); const detail = data && (Array.isArray(data.file_details) ? data.file_details[0] : data.file_details); if (queryError) throw queryError; if (!data || !detail) return error("請先將照片移至垃圾桶。", 404); const { error: storageError } = await admin.storage.from("vault-files").remove([detail.storage_path]); if (storageError) throw storageError; const { error: deleteError } = await admin.from("entries").delete().eq("id", data.id).eq("owner_id", context.userId); if (deleteError) throw deleteError; return NextResponse.json({ ok: true }); } catch { return error("無法永久刪除照片。", 503); }
}
