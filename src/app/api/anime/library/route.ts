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
  isAdult: z.boolean().optional(),
  contentRating: z.string().trim().max(80).nullable().optional(),
  adultSource: z.string().trim().max(120).nullable().optional(),
  externalUrl: safeUrl.nullable().optional(),
});
const createSchema = commonFields;
const updateSchema = commonFields.partial().extend({ id });
const deleteSchema = z.object({ id });
const error = (message: string, statusCode: number) => NextResponse.json({ error: message }, { status: statusCode });

async function replaceCategories(userId: string, animeId: string, categoryIds: string[], scope: "standard" | "adult") {
  const admin = createAdminClient();
  if (categoryIds.length) {
    const { data, error: categoryError } = await admin.from("anime_tags").select("id").eq("user_id", userId).eq("scope", scope).in("id", categoryIds);
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
  return { external_source: "manual", external_id: randomUUID(), title: input.title, title_japanese: metadata?.titleJapanese ?? null, title_english: metadata?.titleEnglish ?? null, title_chinese: metadata?.titleChinese ?? null, original_title: metadata?.originalTitle ?? null, cover_url: coverPath ?? input.coverUrl ?? null, banner_url: null, synopsis: metadata?.synopsis ?? null, anime_type: metadata?.animeType ?? null, broadcast_status: metadata?.broadcastStatus ?? null, episodes: metadata?.episodes ?? null, episode_duration: metadata?.episodeDuration ?? null, release_year: metadata?.releaseYear ?? null, season: metadata?.season ?? null, start_date: metadata?.startDate ?? null, end_date: metadata?.endDate ?? null, age_rating: metadata?.ageRating ?? null, source_material: metadata?.sourceMaterial ?? null, public_score: metadata?.publicScore ?? null, genres: metadata?.genres ?? [], studios: metadata?.studios ?? [], relations: metadata?.relations ?? [], watched_episodes: 0, watch_status: input.watchStatus, rating: input.rating ?? null, notes: input.notes || null, source_url: input.sourceUrl || null, is_adult: input.isAdult ?? false, content_rating: input.contentRating || (input.isAdult ? "成人內容" : null), adult_source: input.isAdult ? input.adultSource || "manual" : null, external_url: input.externalUrl || input.sourceUrl || null, started_watching_at: input.watchStatus === "watching" ? today : null, completed_at: input.watchStatus === "completed" ? today : null };
}

export async function GET(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const adultScope = request.nextUrl.searchParams.get("scope") === "adult";
  if (adultScope && !(await getAnimePreferences(context.userId)).adultModeEnabled) return error("成人內容模式尚未啟用。", 403);
  try { return NextResponse.json(await getAnimeWorkspaceData(context.userId, adultScope ? "adult" : "standard"), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return error("動漫收藏資料尚未啟用或暫時無法讀取。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("請檢查動漫名稱、連結與其他欄位。", 400);
  const coverPath = verifiedCoverPath(context.userId, parsed.data.coverTicket); if (coverPath === undefined) return error("封面上傳已過期，請重新選擇圖片。", 400);
  try {
    if (parsed.data.isAdult && !(await getAnimePreferences(context.userId)).adultModeEnabled) return error("請先在成人內容設定中啟用成人模式。", 403);
    const admin = createAdminClient(); const { data, error: insertError } = await admin.from("anime_library").insert({ user_id: context.userId, ...manualRow(parsed.data, coverPath) }).select("id").single();
    if (insertError) throw insertError; await replaceCategories(context.userId, data.id, parsed.data.categoryIds, parsed.data.isAdult ? "adult" : "standard");
    return NextResponse.json({ id: data.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) { if (caught instanceof Error && caught.message === "Invalid anime category") return error("選取的類別不存在。", 400); return error("無法新增動漫，請稍後再試。", 503); }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("請檢查動漫資料。", 400);
  const coverPath = verifiedCoverPath(context.userId, parsed.data.coverTicket); if (coverPath === undefined) return error("封面上傳已過期，請重新選擇圖片。", 400);
  try {
    const admin = createAdminClient(); const { id: animeId, categoryIds } = parsed.data; const changes = parsed.data;
    const { data: current, error: currentError } = await admin.from("anime_library").select("id,cover_url,watch_status,is_adult").eq("id", animeId).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
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
    if (coverPath) updates.cover_url = coverPath;
    if (Object.keys(updates).length) { const { error: updateError } = await admin.from("anime_library").update(updates).eq("id", animeId).eq("user_id", context.userId); if (updateError) throw updateError; }
    if (coverPath && coverPath !== current.cover_url && current.cover_url?.startsWith(`${context.userId}/covers/`)) await deleteCover(current.cover_url);
    if (categoryIds !== undefined) await replaceCategories(context.userId, animeId, categoryIds, (changes.isAdult ?? current.is_adult) ? "adult" : "standard");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) { if (caught instanceof Error && caught.message === "Invalid anime category") return error("選取的類別不存在。", 400); return error("無法儲存動漫資料，請稍後再試。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("找不到要移除的動漫。", 400);
  try { const { error: deleteError } = await createAdminClient().from("anime_library").update({ deleted_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("user_id", context.userId).is("deleted_at", null); if (deleteError) throw deleteError; return NextResponse.json({ ok: true }); }
  catch { return error("無法移除動漫。", 503); }
}
