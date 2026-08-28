import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteCover, verifiedCoverPath } from "@/lib/content/server";
import { getAnimePreferences, getAnimeWorkspaceData } from "@/lib/anime/data";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const id = z.string().uuid();
const status = z.enum(["planning", "watching", "completed", "paused", "dropped"]);
const safeUrl = z.string().trim().url().max(1000).refine((value) => new URL(value).protocol === "https:", "請使用 HTTPS 連結。");
const catalogueMetadata = z.object({
  titleJapanese: z.string().max(500).nullable().optional(), titleEnglish: z.string().max(500).nullable().optional(), titleChinese: z.string().max(500).nullable().optional(), originalTitle: z.string().max(500).nullable().optional(), synopsis: z.string().max(12000).nullable().optional(), animeType: z.string().max(100).nullable().optional(), broadcastStatus: z.string().max(100).nullable().optional(), episodes: z.number().int().min(0).max(100000).nullable().optional(), episodeDuration: z.number().int().min(0).max(10000).nullable().optional(), releaseYear: z.number().int().min(1900).max(2200).nullable().optional(), season: z.string().max(50).nullable().optional(), startDate: z.string().date().nullable().optional(), endDate: z.string().date().nullable().optional(), ageRating: z.string().max(100).nullable().optional(), sourceMaterial: z.string().max(100).nullable().optional(), publicScore: z.number().min(0).max(10).nullable().optional(), genres: z.array(z.string().max(100)).max(30).optional(), studios: z.array(z.string().max(100)).max(30).optional(), relations: z.array(z.object({ relation: z.string().max(100), malId: z.number().int(), title: z.string().max(500), type: z.string().max(100).nullable() })).max(30).optional(),
});
const commonFields = z.object({
  title: z.string().trim().min(1).max(500),
  sourceUrl: safeUrl.nullable().optional(),
  coverUrl: safeUrl.nullable().optional(),
  metadata: catalogueMetadata.optional(),
  coverTicket: z.string().max(3000).nullable().optional(),
  watchStatus: status.default("planning"),
  rating: z.number().min(0).max(10).nullable().optional(),
  notes: z.string().trim().max(12000).nullable().optional(),
  categoryIds: z.array(id).max(30).default([]),
  folderId: id.nullable().optional(),
  isAdult: z.boolean().optional(),
  contentRating: z.string().trim().max(80).nullable().optional(),
  adultSource: z.string().trim().max(120).nullable().optional(),
  externalUrl: safeUrl.nullable().optional(),
  externalId: z.string().trim().min(1).max(500).optional(),
  externalSource: z.enum(["jikan", "anilist", "bangumi"]).optional(),
});
const createSchema = commonFields;
const updateSchema = commonFields.partial().extend({ id });
const deleteSchema = z.object({ id });
const batchSchema = z.object({
  action: z.enum(["trash", "restore", "permanent", "organize"]),
  ids: z.array(id).min(1).max(100),
  scope: z.enum(["standard", "adult"]).default("standard"),
  folderId: id.nullable().optional(),
  categoryIds: z.array(id).max(30).optional(),
});
const error = (message: string, statusCode: number) => NextResponse.json({ error: message }, { status: statusCode });

async function replaceCategories(userId: string, animeId: string, categoryIds: string[], scope: "standard" | "adult", folderId: string | null) {
  const admin = createAdminClient();
  if (categoryIds.length) {
    let query = admin.from("anime_tags").select("id").eq("user_id", userId).eq("scope", scope).in("id", categoryIds);
    query = folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);
    const { data, error: categoryError } = await query;
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
  const metadata = input.metadata;
  return { external_source: input.externalSource ?? "manual", external_id: input.externalId ?? randomUUID(), title: input.title, title_japanese: metadata?.titleJapanese ?? null, title_english: metadata?.titleEnglish ?? null, title_chinese: metadata?.titleChinese ?? null, original_title: metadata?.originalTitle ?? null, cover_url: coverPath ?? input.coverUrl ?? null, banner_url: null, synopsis: metadata?.synopsis ?? null, anime_type: metadata?.animeType ?? null, broadcast_status: metadata?.broadcastStatus ?? null, episodes: metadata?.episodes ?? null, episode_duration: metadata?.episodeDuration ?? null, release_year: metadata?.releaseYear ?? null, season: metadata?.season ?? null, start_date: metadata?.startDate ?? null, end_date: metadata?.endDate ?? null, age_rating: metadata?.ageRating ?? null, source_material: metadata?.sourceMaterial ?? null, public_score: metadata?.publicScore ?? null, genres: metadata?.genres ?? [], studios: metadata?.studios ?? [], relations: metadata?.relations ?? [], watched_episodes: 0, watch_status: input.watchStatus, rating: input.rating ?? null, notes: input.notes || null, source_url: input.sourceUrl || null, is_adult: input.isAdult ?? false, content_rating: input.contentRating || (input.isAdult ? "成人內容" : null), adult_source: input.isAdult ? input.adultSource || "manual" : null, external_url: input.externalUrl || input.sourceUrl || null, started_watching_at: input.watchStatus === "watching" ? today : null, completed_at: input.watchStatus === "completed" ? today : null };
}

export async function GET(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const adultScope = request.nextUrl.searchParams.get("scope") === "adult";
  if (adultScope && !(await getAnimePreferences(context.userId)).adultModeEnabled) return error("成人內容模式尚未啟用。", 403);
  const trashed = request.nextUrl.searchParams.get("view") === "trash";
  try { return NextResponse.json(await getAnimeWorkspaceData(context.userId, adultScope ? "adult" : "standard", { trashed }), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return error("動漫收藏資料尚未啟用或暫時無法讀取。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("請檢查動漫名稱、連結與其他欄位。", 400);
  const coverPath = verifiedCoverPath(context.userId, parsed.data.coverTicket); if (coverPath === undefined) return error("封面上傳已過期，請重新選擇圖片。", 400);
  try {
    if (parsed.data.isAdult && !(await getAnimePreferences(context.userId)).adultModeEnabled) return error("請先在成人內容設定中啟用成人模式。", 403);
    const scope = parsed.data.isAdult ? "adult" : "standard" as const;
    const admin = createAdminClient(); if (parsed.data.folderId) { const { data: folder } = await admin.from("anime_folders").select("id").eq("id", parsed.data.folderId).eq("user_id", context.userId).eq("scope", scope).maybeSingle(); if (!folder) return error("請選擇目前清單內的資料夾。", 400); }
    const { data, error: insertError } = await admin.from("anime_library").insert({ user_id: context.userId, ...manualRow(parsed.data, coverPath), folder_id: parsed.data.folderId ?? null }).select("id").single();
    if (insertError) throw insertError; await replaceCategories(context.userId, data.id, parsed.data.categoryIds, scope, parsed.data.folderId ?? null);
    return NextResponse.json({ id: data.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) { if (caught instanceof Error && caught.message === "Invalid anime category") return error("選取的類別不存在。", 400); return error("無法新增動漫，請稍後再試。", 503); }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const input = await request.json().catch(() => null);
  const batch = batchSchema.safeParse(input);
  if (batch.success) {
    const { action, ids, scope, folderId, categoryIds = [] } = batch.data;
    if (scope === "adult" && !(await getAnimePreferences(context.userId)).adultModeEnabled) return error("成人內容模式尚未啟用。", 403);
    const admin = createAdminClient();
    let target = admin.from("anime_library").select("id,cover_url").eq("user_id", context.userId).in("id", ids);
    target = scope === "adult" ? target.eq("is_adult", true) : target.or("is_adult.is.null,is_adult.eq.false");
    target = action === "restore" || action === "permanent" ? target.not("deleted_at", "is", null) : target.is("deleted_at", null);
    const { data: matches, error: matchError } = await target;
    if (matchError) return error("無法取得選取的動漫。", 503);
    const targetIds = (matches ?? []).map((item) => item.id);
    if (!targetIds.length) return error("找不到可處理的動漫。", 404);
    try {
      if (action === "organize") {
        if (folderId) { const { data: folder } = await admin.from("anime_folders").select("id").eq("id", folderId).eq("user_id", context.userId).eq("scope", scope).maybeSingle(); if (!folder) return error("請選擇目前清單內的資料夾。", 400); }
        const { error: folderError } = await admin.from("anime_library").update({ folder_id: folderId ?? null }).eq("user_id", context.userId).in("id", targetIds);
        if (folderError) throw folderError;
        await Promise.all(targetIds.map((animeId) => replaceCategories(context.userId, animeId, categoryIds, scope, folderId ?? null)));
      } else if (action === "permanent") {
        const { error: removeError } = await admin.from("anime_library").delete().eq("user_id", context.userId).in("id", targetIds);
        if (removeError) throw removeError;
        await Promise.all((matches ?? []).flatMap((item) => item.cover_url?.startsWith(`${context.userId}/covers/`) ? [deleteCover(item.cover_url)] : []));
      } else {
        const { error: updateError } = await admin.from("anime_library").update({ deleted_at: action === "trash" ? new Date().toISOString() : null }).eq("user_id", context.userId).in("id", targetIds);
        if (updateError) throw updateError;
      }
      return NextResponse.json({ ok: true, count: targetIds.length }, { headers: { "Cache-Control": "private, no-store" } });
    } catch { return error(action === "permanent" ? "無法永久刪除動漫。" : action === "restore" ? "無法還原動漫。" : action === "organize" ? "無法整理動漫。" : "無法移除動漫。", 503); }
  }
  const parsed = updateSchema.safeParse(input); if (!parsed.success) return error("請檢查動漫資料。", 400);
  const coverPath = verifiedCoverPath(context.userId, parsed.data.coverTicket); if (coverPath === undefined) return error("封面上傳已過期，請重新選擇圖片。", 400);
  try {
    const admin = createAdminClient(); const { id: animeId, categoryIds } = parsed.data; const changes = parsed.data;
    const { data: current, error: currentError } = await admin.from("anime_library").select("id,cover_url,watch_status,is_adult,folder_id").eq("id", animeId).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
    if (currentError) throw currentError; if (!current) return error("找不到這部動漫。", 404);
    const updates: Record<string, unknown> = {};
    if (changes.title !== undefined) updates.title = changes.title;
    if (changes.sourceUrl !== undefined) updates.source_url = changes.sourceUrl || null;
    if (changes.coverUrl !== undefined && !coverPath) updates.cover_url = changes.coverUrl || null;
    if (changes.watchStatus !== undefined) { updates.watch_status = changes.watchStatus; if (changes.watchStatus === "watching" && current.watch_status !== "watching") updates.started_watching_at = new Date().toISOString().slice(0, 10); if (changes.watchStatus === "completed") updates.completed_at = new Date().toISOString().slice(0, 10); }
    if (changes.rating !== undefined) updates.rating = changes.rating;
    if (changes.notes !== undefined) updates.notes = changes.notes || null;
    if (changes.isAdult !== undefined) {
      if (changes.isAdult && !(await getAnimePreferences(context.userId)).adultModeEnabled) return error("請先在成人內容設定中啟用成人模式。", 403);
      updates.is_adult = changes.isAdult;
    }
    if (changes.contentRating !== undefined) updates.content_rating = changes.contentRating || null;
    if (changes.adultSource !== undefined) updates.adult_source = changes.isAdult === false ? null : changes.adultSource || (current.is_adult ? "manual" : null);
    if (changes.externalUrl !== undefined) updates.external_url = changes.externalUrl || null;
    const effectiveAdult = changes.isAdult ?? current.is_adult;
    const effectiveScope = effectiveAdult ? "adult" : "standard" as const;
    const effectiveFolderId = changes.folderId === undefined ? current.folder_id : changes.folderId;
    if (changes.folderId !== undefined) { if (changes.folderId) { const { data: folder } = await admin.from("anime_folders").select("id").eq("id", changes.folderId).eq("user_id", context.userId).eq("scope", effectiveScope).maybeSingle(); if (!folder) return error("請選擇目前清單內的資料夾。", 400); } updates.folder_id = changes.folderId; }
    if (coverPath) updates.cover_url = coverPath;
    if (Object.keys(updates).length) { const { error: updateError } = await admin.from("anime_library").update(updates).eq("id", animeId).eq("user_id", context.userId); if (updateError) throw updateError; }
    if (coverPath && coverPath !== current.cover_url && current.cover_url?.startsWith(`${context.userId}/covers/`)) await deleteCover(current.cover_url);
    if (categoryIds !== undefined) await replaceCategories(context.userId, animeId, categoryIds, effectiveScope, effectiveFolderId ?? null);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) { if (caught instanceof Error && caught.message === "Invalid anime category") return error("選取的類別不存在。", 400); return error("無法儲存動漫資料，請稍後再試。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("找不到要移除的動漫。", 400);
  try { const { error: deleteError } = await createAdminClient().from("anime_library").update({ deleted_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("user_id", context.userId).is("deleted_at", null); if (deleteError) throw deleteError; return NextResponse.json({ ok: true }); }
  catch { return error("無法移除動漫。", 503); }
}
