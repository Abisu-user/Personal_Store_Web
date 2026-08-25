import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteCover, verifiedCoverPath } from "@/lib/content/server";
import { getAnimeWorkspaceData } from "@/lib/anime/data";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const id = z.string().uuid();
const status = z.enum(["planning", "watching", "completed", "paused", "dropped"]);
const safeUrl = z.string().trim().url().max(1000).refine((value) => new URL(value).protocol === "https:", "請使用 HTTPS 連結。");
const commonFields = z.object({
  title: z.string().trim().min(1).max(500),
  sourceUrl: safeUrl.nullable().optional(),
  coverTicket: z.string().max(3000).nullable().optional(),
  watchStatus: status.default("planning"),
  rating: z.number().min(0).max(10).nullable().optional(),
  notes: z.string().trim().max(12000).nullable().optional(),
  categoryIds: z.array(id).max(30).default([]),
});
const createSchema = commonFields;
const updateSchema = commonFields.partial().extend({ id });
const deleteSchema = z.object({ id });
const error = (message: string, statusCode: number) => NextResponse.json({ error: message }, { status: statusCode });

async function replaceCategories(userId: string, animeId: string, categoryIds: string[]) {
  const admin = createAdminClient();
  if (categoryIds.length) {
    const { data, error: categoryError } = await admin.from("anime_tags").select("id").eq("user_id", userId).in("id", categoryIds);
    if (categoryError || (data?.length ?? 0) !== categoryIds.length) throw new Error("Invalid anime category");
  }
  const { error: deleteError } = await admin.from("anime_library_tags").delete().eq("anime_id", animeId);
  if (deleteError) throw deleteError;
  if (!categoryIds.length) return;
  const { error: insertError } = await admin.from("anime_library_tags").insert(categoryIds.map((categoryId) => ({ anime_id: animeId, tag_id: categoryId })));
  if (insertError) throw insertError;
}

function manualRow(input: z.infer<typeof commonFields>, coverPath: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  return { external_source: "manual", external_id: randomUUID(), title: input.title, cover_url: coverPath, banner_url: null, synopsis: null, anime_type: null, broadcast_status: null, episodes: null, watched_episodes: 0, watch_status: input.watchStatus, rating: input.rating ?? null, notes: input.notes || null, source_url: input.sourceUrl || null, started_watching_at: input.watchStatus === "watching" ? today : null, completed_at: input.watchStatus === "completed" ? today : null };
}

export async function GET() {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  try { return NextResponse.json(await getAnimeWorkspaceData(context.userId), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return error("動漫收藏資料尚未啟用或暫時無法讀取。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("請檢查動漫名稱、連結與其他欄位。", 400);
  const coverPath = verifiedCoverPath(context.userId, parsed.data.coverTicket); if (coverPath === undefined) return error("封面上傳已過期，請重新選擇圖片。", 400);
  try {
    const admin = createAdminClient(); const { data, error: insertError } = await admin.from("anime_library").insert({ user_id: context.userId, ...manualRow(parsed.data, coverPath) }).select("id").single();
    if (insertError) throw insertError; await replaceCategories(context.userId, data.id, parsed.data.categoryIds);
    return NextResponse.json({ id: data.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) { if (caught instanceof Error && caught.message === "Invalid anime category") return error("選取的類別不存在。", 400); return error("無法新增動漫，請稍後再試。", 503); }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("請檢查動漫資料。", 400);
  const coverPath = verifiedCoverPath(context.userId, parsed.data.coverTicket); if (coverPath === undefined) return error("封面上傳已過期，請重新選擇圖片。", 400);
  try {
    const admin = createAdminClient(); const { id: animeId, categoryIds } = parsed.data; const changes = parsed.data;
    const { data: current, error: currentError } = await admin.from("anime_library").select("id,cover_url,watch_status").eq("id", animeId).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
    if (currentError) throw currentError; if (!current) return error("找不到這部動漫。", 404);
    const updates: Record<string, unknown> = {};
    if (changes.title !== undefined) updates.title = changes.title;
    if (changes.sourceUrl !== undefined) updates.source_url = changes.sourceUrl || null;
    if (changes.watchStatus !== undefined) { updates.watch_status = changes.watchStatus; if (changes.watchStatus === "watching" && current.watch_status !== "watching") updates.started_watching_at = new Date().toISOString().slice(0, 10); if (changes.watchStatus === "completed") updates.completed_at = new Date().toISOString().slice(0, 10); }
    if (changes.rating !== undefined) updates.rating = changes.rating;
    if (changes.notes !== undefined) updates.notes = changes.notes || null;
    if (coverPath) updates.cover_url = coverPath;
    if (Object.keys(updates).length) { const { error: updateError } = await admin.from("anime_library").update(updates).eq("id", animeId).eq("user_id", context.userId); if (updateError) throw updateError; }
    if (coverPath && coverPath !== current.cover_url && current.cover_url?.startsWith(`${context.userId}/covers/`)) await deleteCover(current.cover_url);
    if (categoryIds !== undefined) await replaceCategories(context.userId, animeId, categoryIds);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) { if (caught instanceof Error && caught.message === "Invalid anime category") return error("選取的類別不存在。", 400); return error("無法儲存動漫資料，請稍後再試。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("找不到要移除的動漫。", 400);
  try { const { error: deleteError } = await createAdminClient().from("anime_library").update({ deleted_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("user_id", context.userId).is("deleted_at", null); if (deleteError) throw deleteError; return NextResponse.json({ ok: true }); }
  catch { return error("無法移除動漫。", 503); }
}
