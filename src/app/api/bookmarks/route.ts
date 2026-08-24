import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookmarksWorkspaceData } from "@/lib/bookmarks/data";
import { getLinkPreview } from "@/lib/bookmarks/preview";
import { deleteCover, verifiedCoverPath } from "@/lib/content/server";
import { getSecurityContext } from "@/lib/security/activity";

const bookmarkSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  title: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  bookmarkFolderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  favorite: z.boolean().optional().default(false),
  pinned: z.boolean().optional().default(false),
  archived: z.boolean().optional().default(false),
  coverTicket: z.string().max(3000).nullable().optional(),
});
const bookmarkUpdateSchema = bookmarkSchema.extend({ id: z.string().uuid() });
const entryActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["toggle_favorite", "toggle_pinned", "archive", "unarchive", "trash", "restore"]),
});
const bulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["trash", "permanent"]),
});

function jsonError(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }
async function requireContext() { const context = await getSecurityContext(); return context; }
async function resolveTags(ownerId: string, names: string[]) {
  const unique = [...new Set(names.map((name) => name.toLocaleLowerCase("en-US")))];
  if (!unique.length) return [] as { id: string }[];
  const { data, error } = await createAdminClient().from("tags").upsert(unique.map((name) => ({ owner_id: ownerId, name })), { onConflict: "owner_id,name" }).select("id");
  if (error) throw error;
  return data ?? [];
}
async function replaceTags(entryId: string, tagIds: string[]) {
  const admin = createAdminClient();
  const { error: deleted } = await admin.from("entry_tags").delete().eq("entry_id", entryId);
  if (deleted) throw deleted;
  if (tagIds.length) { const { error } = await admin.from("entry_tags").insert(tagIds.map((tagId) => ({ entry_id: entryId, tag_id: tagId }))); if (error) throw error; }
}
async function validateBookmarkFolder(ownerId: string, bookmarkFolderId: string | null | undefined) {
  if (!bookmarkFolderId) return;
  const { data, error } = await createAdminClient().from("bookmark_folders").select("id").eq("id", bookmarkFolderId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("BOOKMARK_FOLDER_NOT_FOUND");
}

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireContext();
  if (!context) return jsonError("Unauthorized", 401);
  try {
    return NextResponse.json(await getBookmarksWorkspaceData(context.userId), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("Bookmarks are temporarily unavailable.", 503); }
}

export async function POST(request: NextRequest) {
  const context = await requireContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = bookmarkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("請確認書籤資料格式。", 400);
  let normalizedUrl: string;
  try { const url = new URL(parsed.data.url); if (!/^https?:$/.test(url.protocol)) throw new Error(); normalizedUrl = url.toString(); } catch { return jsonError("網址必須以 http:// 或 https:// 開頭。", 400); }
  try {
    const admin = createAdminClient();
    const previewPromise = getLinkPreview(normalizedUrl);
    if (parsed.data.categoryId) {
      const { data: category } = await admin.from("categories").select("id").eq("id", parsed.data.categoryId).eq("owner_id", context.userId).eq("content_kind", "bookmark").maybeSingle();
      if (!category) return jsonError("找不到指定分類。", 400);
    }
    try { await validateBookmarkFolder(context.userId, parsed.data.bookmarkFolderId); } catch (error) { if (error instanceof Error && error.message === "BOOKMARK_FOLDER_NOT_FOUND") return jsonError("找不到指定收藏資料夾。", 400); throw error; }
    const coverPath = verifiedCoverPath(context.userId, parsed.data.coverTicket);
    if (coverPath === undefined) return jsonError("封面上傳已過期，請重新選擇圖片。", 400);
    const tagRows = await resolveTags(context.userId, parsed.data.tags);
    const preview = await previewPromise;
    const title = parsed.data.title || preview.title || preview.hostname;
    const description = parsed.data.description || preview.description || null;
    const { data: entry, error: entryError } = await admin.from("entries").insert({ owner_id: context.userId, kind: "bookmark", title, description, category_id: parsed.data.categoryId ?? null, bookmark_folder_id: parsed.data.bookmarkFolderId ?? null, cover_image_path: coverPath ?? null, is_favorite: parsed.data.favorite, is_pinned: parsed.data.pinned && !parsed.data.archived, is_archived: parsed.data.archived }).select("id").single();
    if (entryError) throw entryError;
    const { error: detailsError } = await admin.from("bookmark_details").insert({ entry_id: entry.id, url: normalizedUrl, site_title: preview.title, favicon_url: preview.imageUrl ?? preview.faviconUrl, notes: description });
    if (detailsError) { await admin.from("entries").delete().eq("id", entry.id).eq("owner_id", context.userId); throw detailsError; }
    await replaceTags(entry.id, tagRows.map((tag) => tag.id));
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "bookmark_created", entry_id: entry.id, metadata: { tag_count: tagRows.length, has_category: Boolean(parsed.data.categoryId) }, ip_hash: context.ipHash });
    return NextResponse.json({ id: entry.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("無法儲存書籤，請稍後再試。", 503); }
}

export async function PATCH(request: NextRequest) {
  const context = await requireContext();
  if (!context) return jsonError("Unauthorized", 401);
  const body = await request.json().catch(() => null);
  const bulk = bulkActionSchema.safeParse(body);
  const update = bookmarkUpdateSchema.safeParse(body);
  const parsed = entryActionSchema.safeParse(body);
  if (!bulk.success && !update.success && !parsed.success) return jsonError("Invalid request", 400);

  try {
    const admin = createAdminClient();
    if (bulk.success) {
      const query = bulk.data.action === "trash"
        ? admin.from("entries").update({ deleted_at: new Date().toISOString(), is_pinned: false }).in("id", bulk.data.ids).eq("owner_id", context.userId).eq("kind", "bookmark").is("deleted_at", null).select("id")
        : admin.from("entries").delete().in("id", bulk.data.ids).eq("owner_id", context.userId).eq("kind", "bookmark").not("deleted_at", "is", null).select("id");
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) return jsonError("找不到可處理的書籤。", 404);
      await admin.from("audit_logs").insert({ owner_id: context.userId, action: `bookmark_bulk_${bulk.data.action}`, metadata: { count: data.length }, ip_hash: context.ipHash });
      return NextResponse.json({ count: data.length }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (update.success) {
      if (update.data.categoryId) {
        const { data: category } = await admin.from("categories").select("id").eq("id", update.data.categoryId).eq("owner_id", context.userId).eq("content_kind", "bookmark").maybeSingle();
        if (!category) return jsonError("找不到指定分類。", 400);
      }
      try { await validateBookmarkFolder(context.userId, update.data.bookmarkFolderId); } catch (error) { if (error instanceof Error && error.message === "BOOKMARK_FOLDER_NOT_FOUND") return jsonError("找不到指定收藏資料夾。", 400); throw error; }
      const newCoverPath = verifiedCoverPath(context.userId, update.data.coverTicket);
      if (newCoverPath === undefined) return jsonError("封面上傳已過期，請重新選擇圖片。", 400);
      const { data: current, error: currentError } = await admin.from("entries").select("id, cover_image_path").eq("id", update.data.id).eq("owner_id", context.userId).eq("kind", "bookmark").is("deleted_at", null).maybeSingle();
      if (currentError) throw currentError;
      if (!current) return jsonError("找不到書籤。", 404);
      const tagRows = await resolveTags(context.userId, update.data.tags);
      const { error: entryError } = await admin.from("entries").update({ title: update.data.title || "未命名書籤", description: update.data.description || null, category_id: update.data.categoryId ?? null, bookmark_folder_id: update.data.bookmarkFolderId ?? null, is_favorite: update.data.favorite, is_pinned: update.data.pinned && !update.data.archived, is_archived: update.data.archived, ...(newCoverPath ? { cover_image_path: newCoverPath } : {}) }).eq("id", current.id).eq("owner_id", context.userId);
      if (entryError) throw entryError;
      await replaceTags(current.id, tagRows.map((tag) => tag.id));
      if (newCoverPath && newCoverPath !== current.cover_image_path) await deleteCover(current.cover_image_path);
      await admin.from("audit_logs").insert({ owner_id: context.userId, action: "bookmark_updated", entry_id: current.id, metadata: { tag_count: tagRows.length }, ip_hash: context.ipHash });
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (!parsed.success) return jsonError("Invalid request", 400);
    const { data: current, error: currentError } = await admin
      .from("entries")
      .select("id, is_favorite, is_pinned, deleted_at")
      .eq("id", parsed.data.id)
      .eq("owner_id", context.userId)
      .eq("kind", "bookmark")
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return jsonError("Not found", 404);

    const updates = (() => {
      switch (parsed.data.action) {
        case "toggle_favorite": return current.deleted_at ? null : { is_favorite: !current.is_favorite };
        case "toggle_pinned": return current.deleted_at ? null : { is_pinned: !current.is_pinned };
        case "archive": return current.deleted_at ? null : { is_archived: true, is_pinned: false };
        case "unarchive": return current.deleted_at ? null : { is_archived: false };
        case "trash": return current.deleted_at ? null : { deleted_at: new Date().toISOString(), is_pinned: false };
        case "restore": return current.deleted_at ? { deleted_at: null, is_archived: false } : null;
      }
    })();
    if (!updates) return jsonError("此書籤目前無法執行這項操作。", 409);

    const { error } = await admin.from("entries")
      .update(updates)
      .eq("id", current.id)
      .eq("owner_id", context.userId)
      .eq("kind", "bookmark");
    if (error) throw error;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: `bookmark_${parsed.data.action}`, entry_id: current.id, metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return jsonError("無法更新書籤狀態。", 503);
  }
}

export async function DELETE(request: NextRequest) {
  const context = await requireContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request", 400);
  try {
    const admin = createAdminClient();
    const { data: entry, error } = await admin.from("entries").delete().eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "bookmark").not("deleted_at", "is", null).select("id").maybeSingle();
    if (error) throw error;
    if (!entry) return jsonError("Not found", 404);
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "bookmark_permanently_deleted", metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("無法刪除書籤。", 503); }
}
