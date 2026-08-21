import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getNotesWorkspaceData } from "@/lib/notes/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";
import { deleteCover, validateContentFolder, verifiedCoverPath } from "@/lib/content/server";

const noteSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional(),
  content: z.string().max(100_000),
  categoryId: z.string().uuid().nullable().optional(),
  contentFolderId: z.string().uuid().nullable().optional(),
  favorite: z.boolean().optional().default(false),
  pinned: z.boolean().optional().default(false),
  archived: z.boolean().optional().default(false),
  coverTicket: z.string().max(3000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
});
const updateSchema = noteSchema.extend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });
const actionSchema = z.object({ id: z.string().uuid(), action: z.enum(["trash", "restore"]) });

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function validateCategory(ownerId: string, categoryId: string | null | undefined) {
  if (!categoryId) return true;
  const admin = createAdminClient();
  const { data } = await admin.from("categories").select("id").eq("id", categoryId).eq("owner_id", ownerId).maybeSingle();
  return Boolean(data);
}

async function resolveTags(ownerId: string, inputTags: string[]) {
  const names = [...new Set(inputTags.map((tag) => tag.toLocaleLowerCase("en-US")))];
  if (!names.length) return [] as { id: string }[];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tags")
    .upsert(names.map((name) => ({ owner_id: ownerId, name })), { onConflict: "owner_id,name" })
    .select("id");
  if (error) throw error;
  return data ?? [];
}

async function replaceEntryTags(entryId: string, tagIds: string[]) {
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

  try {
    return NextResponse.json(await getNotesWorkspaceData(context.userId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return jsonError("Notes are temporarily unavailable.", 503);
  }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("請檢查筆記欄位。", 400);
  if (!(await validateCategory(context.userId, parsed.data.categoryId))) return jsonError("找不到指定分類。", 400);
  if (!(await validateContentFolder(context.userId, "note", parsed.data.contentFolderId))) return jsonError("找不到指定資料夾。", 400);
  const coverPath = verifiedCoverPath(context.userId, parsed.data.coverTicket);
  if (coverPath === undefined) return jsonError("封面上傳已過期，請重新選擇圖片。", 400);

  let entryId: string | null = null;
  try {
    const admin = createAdminClient();
    const tagRows = await resolveTags(context.userId, parsed.data.tags);
    const { data: entry, error: entryError } = await admin
      .from("entries")
      .insert({
        owner_id: context.userId,
        kind: "note",
        title: parsed.data.title,
        description: parsed.data.description || null,
        category_id: parsed.data.categoryId ?? null,
        content_folder_id: parsed.data.contentFolderId ?? null,
        is_favorite: parsed.data.favorite,
        is_pinned: parsed.data.pinned && !parsed.data.archived,
        is_archived: parsed.data.archived,
        cover_image_path: coverPath,
      })
      .select("id")
      .single();
    if (entryError) throw entryError;
    entryId = entry.id;

    const { error: detailError } = await admin
      .from("note_details")
      .insert({ entry_id: entry.id, content_markdown: parsed.data.content, current_version: 1 });
    if (detailError) throw detailError;

    const { error: versionError } = await admin
      .from("note_versions")
      .insert({ entry_id: entry.id, version: 1, content_markdown: parsed.data.content });
    if (versionError) throw versionError;

    await replaceEntryTags(entry.id, tagRows.map((tag) => tag.id));
    await admin.from("audit_logs").insert({
      owner_id: context.userId,
      action: "note_created",
      entry_id: entry.id,
      metadata: { tag_count: tagRows.length },
      ip_hash: context.ipHash,
    });
    return NextResponse.json({ id: entry.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    if (entryId) await createAdminClient().from("entries").delete().eq("id", entryId).eq("owner_id", context.userId);
    return jsonError("無法建立筆記，請稍後再試。", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const requestBody = await request.json().catch(() => null);
  const action = actionSchema.safeParse(requestBody);
  if (action.success) {
    try {
      const admin = createAdminClient();
      const { data: current, error } = await admin.from("entries").select("id, deleted_at").eq("id", action.data.id).eq("owner_id", context.userId).eq("kind", "note").maybeSingle();
      if (error) throw error;
      if (!current) return jsonError("找不到筆記。", 404);
      const updates = action.data.action === "trash" ? current.deleted_at ? null : { deleted_at: new Date().toISOString(), is_pinned: false } : current.deleted_at ? { deleted_at: null } : null;
      if (!updates) return jsonError("此筆記目前無法執行這項操作。", 409);
      const { error: updateError } = await admin.from("entries").update(updates).eq("id", current.id).eq("owner_id", context.userId);
      if (updateError) throw updateError;
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    } catch { return jsonError("無法更新筆記狀態。", 503); }
  }
  const parsed = updateSchema.safeParse(requestBody);
  if (!parsed.success) return jsonError("請檢查筆記欄位。", 400);
  if (!(await validateCategory(context.userId, parsed.data.categoryId))) return jsonError("找不到指定分類。", 400);
  if (!(await validateContentFolder(context.userId, "note", parsed.data.contentFolderId))) return jsonError("找不到指定資料夾。", 400);
  const newCoverPath = verifiedCoverPath(context.userId, parsed.data.coverTicket);
  if (newCoverPath === undefined) return jsonError("封面上傳已過期，請重新選擇圖片。", 400);

  try {
    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("entries")
      .select("id, cover_image_path, note_details(content_markdown, current_version)")
      .eq("id", parsed.data.id)
      .eq("owner_id", context.userId)
      .eq("kind", "note")
      .is("deleted_at", null)
      .maybeSingle();
    const detail = existing && (Array.isArray(existing.note_details) ? existing.note_details[0] : existing.note_details);
    if (existingError) throw existingError;
    if (!existing || !detail) return jsonError("找不到筆記。", 404);

    const tagRows = await resolveTags(context.userId, parsed.data.tags);
    const { error: entryError } = await admin
      .from("entries")
      .update({
        title: parsed.data.title,
        description: parsed.data.description || null,
        category_id: parsed.data.categoryId ?? null,
        content_folder_id: parsed.data.contentFolderId ?? null,
        is_favorite: parsed.data.favorite,
        is_pinned: parsed.data.pinned && !parsed.data.archived,
        is_archived: parsed.data.archived,
        ...(newCoverPath ? { cover_image_path: newCoverPath } : {}),
      })
      .eq("id", existing.id)
      .eq("owner_id", context.userId);
    if (entryError) throw entryError;
    if (newCoverPath && newCoverPath !== existing.cover_image_path) await deleteCover(existing.cover_image_path);
    await replaceEntryTags(existing.id, tagRows.map((tag) => tag.id));

    const contentChanged = parsed.data.content !== detail.content_markdown;
    if (contentChanged) {
      const nextVersion = detail.current_version + 1;
      const { data: updatedDetail, error: detailError } = await admin
        .from("note_details")
        .update({ content_markdown: parsed.data.content, current_version: nextVersion })
        .eq("entry_id", existing.id)
        .eq("current_version", detail.current_version)
        .select("entry_id")
        .maybeSingle();
      if (detailError) throw detailError;
      if (!updatedDetail) return jsonError("筆記剛被更新，請重新整理後再試。", 409);

      const { error: versionError } = await admin
        .from("note_versions")
        .insert({ entry_id: existing.id, version: nextVersion, content_markdown: parsed.data.content });
      if (versionError) {
        await admin
          .from("note_details")
          .update({ content_markdown: detail.content_markdown, current_version: detail.current_version })
          .eq("entry_id", existing.id)
          .eq("current_version", nextVersion);
        throw versionError;
      }
    }

    await admin.from("audit_logs").insert({
      owner_id: context.userId,
      action: "note_updated",
      entry_id: existing.id,
      metadata: { content_changed: contentChanged, tag_count: tagRows.length },
      ip_hash: context.ipHash,
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return jsonError("無法儲存筆記，請稍後再試。", 503);
  }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request", 400);

  try {
    const admin = createAdminClient();
    const { data: entry, error } = await admin
      .from("entries")
      .select("id, cover_image_path")
      .eq("id", parsed.data.id)
      .eq("owner_id", context.userId)
      .eq("kind", "note")
      .not("deleted_at", "is", null)
      .maybeSingle();
    if (error) throw error;
    if (!entry) return jsonError("請先將筆記移至垃圾桶。", 404);
    await deleteCover(entry.cover_image_path);
    const { error: deleteError } = await admin.from("entries").delete().eq("id", entry.id).eq("owner_id", context.userId);
    if (deleteError) throw deleteError;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "note_deleted", metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return jsonError("無法刪除筆記，請稍後再試。", 503);
  }
}
