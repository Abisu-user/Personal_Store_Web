import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnimeDetail } from "@/lib/anime/jikan-service";
import { getAnimeWorkspaceData } from "@/lib/anime/data";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const id = z.string().uuid();
const status = z.enum(["planning", "watching", "completed", "paused", "dropped"]);
const rank = z.enum(["normal", "like", "love", "masterpiece"]);
const createSchema = z.object({ externalId: z.string().regex(/^\d{1,12}$/), watchStatus: status.default("planning"), watchedEpisodes: z.number().int().min(0).max(100000).default(0), tagIds: z.array(id).max(30).default([]), favorite: z.boolean().default(false) });
const updateSchema = z.object({ id, watchStatus: status.optional(), watchedEpisodes: z.number().int().min(0).max(100000).optional(), rating: z.number().min(0).max(10).nullable().optional(), favorite: z.boolean().optional(), personalRank: rank.nullable().optional(), notes: z.string().trim().max(12000).nullable().optional(), tagIds: z.array(id).max(30).optional() });
const deleteSchema = z.object({ id });
const error = (message: string, statusCode: number) => NextResponse.json({ error: message }, { status: statusCode });

function rowFor(anime: Awaited<ReturnType<typeof getAnimeDetail>>) {
  return { external_source: "jikan", external_id: anime.id, title: anime.title, title_japanese: anime.titleJapanese, title_english: anime.titleEnglish, title_chinese: anime.titleChinese, original_title: anime.originalTitle, cover_url: anime.coverUrl, banner_url: anime.bannerUrl, synopsis: anime.synopsis, anime_type: anime.animeType, broadcast_status: anime.broadcastStatus, episodes: anime.episodes, episode_duration: anime.episodeDuration, release_year: anime.releaseYear, season: anime.season, start_date: anime.startDate, end_date: anime.endDate, age_rating: anime.ageRating, source_material: anime.sourceMaterial, public_score: anime.publicScore, genres: anime.genres, studios: anime.studios, relations: anime.relations };
}

async function replaceTags(userId: string, animeId: string, tagIds: string[]) {
  const admin = createAdminClient();
  if (tagIds.length) { const { data, error: tagError } = await admin.from("anime_tags").select("id").eq("user_id", userId).in("id", tagIds); if (tagError || (data?.length ?? 0) !== tagIds.length) throw new Error("Invalid anime tag"); }
  const { error: deleteError } = await admin.from("anime_library_tags").delete().eq("anime_id", animeId); if (deleteError) throw deleteError;
  if (tagIds.length) { const { error: insertError } = await admin.from("anime_library_tags").insert(tagIds.map((tagId) => ({ anime_id: animeId, tag_id: tagId }))); if (insertError) throw insertError; }
}

export async function GET() { const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401); try { return NextResponse.json(await getAnimeWorkspaceData(context.userId), { headers: { "Cache-Control": "private, no-store" } }); } catch { return error("動漫收藏資料尚未啟用或暫時無法讀取。", 503); } }

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401); const parsed = createSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("請檢查加入動漫的資料。", 400);
  try {
    const [anime, admin] = await Promise.all([getAnimeDetail(parsed.data.externalId), Promise.resolve(createAdminClient())]);
    if (anime.episodes !== null && parsed.data.watchedEpisodes > anime.episodes) return error("觀看集數不能大於作品總集數。", 400);
    const isCompleted = anime.episodes !== null && parsed.data.watchedEpisodes === anime.episodes;
    const { data, error: insertError } = await admin.from("anime_library").upsert({ user_id: context.userId, ...rowFor(anime), watch_status: isCompleted ? "completed" : parsed.data.watchStatus, watched_episodes: parsed.data.watchedEpisodes, favorite: parsed.data.favorite, started_watching_at: parsed.data.watchStatus === "watching" ? new Date().toISOString().slice(0, 10) : null, completed_at: isCompleted || parsed.data.watchStatus === "completed" ? new Date().toISOString().slice(0, 10) : null }, { onConflict: "user_id,external_source,external_id" }).select("id").single();
    if (insertError) throw insertError; await replaceTags(context.userId, data.id, parsed.data.tagIds); return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (caught) { if (caught instanceof Error && caught.message === "Invalid anime tag") return error("選取的標籤不存在。", 400); return error("無法加入動漫，請稍後再試。", 503); }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401); const parsed = updateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("請檢查動漫資料。", 400);
  try {
    const admin = createAdminClient(); const { tagIds, id: animeId, ...changes } = parsed.data;
    const { data: current, error: currentError } = await admin.from("anime_library").select("episodes,watched_episodes,watch_status").eq("id", animeId).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
    if (currentError) throw currentError; if (!current) return error("找不到這部動漫。", 404); const nextEpisodes = changes.watchedEpisodes ?? current.watched_episodes;
    if (current.episodes !== null && nextEpisodes > current.episodes) return error("觀看集數不能大於作品總集數。", 400);
    const completed = current.episodes !== null && nextEpisodes === current.episodes && (changes.watchStatus ?? current.watch_status) === "watching";
    const updates: Record<string, unknown> = {}; if (changes.watchStatus) updates.watch_status = changes.watchStatus; if (changes.watchedEpisodes !== undefined) updates.watched_episodes = changes.watchedEpisodes; if (changes.rating !== undefined) updates.rating = changes.rating; if (changes.favorite !== undefined) updates.favorite = changes.favorite; if (changes.personalRank !== undefined) updates.personal_rank = changes.personalRank; if (changes.notes !== undefined) updates.notes = changes.notes || null; if (changes.watchStatus === "watching" && current.watch_status !== "watching") updates.started_watching_at = new Date().toISOString().slice(0, 10); if (changes.watchStatus === "completed" || completed) { updates.watch_status = "completed"; updates.completed_at = new Date().toISOString().slice(0, 10); }
    if (Object.keys(updates).length) { const { error: updateError } = await admin.from("anime_library").update(updates).eq("id", animeId).eq("user_id", context.userId); if (updateError) throw updateError; }
    if (tagIds) await replaceTags(context.userId, animeId, tagIds); return NextResponse.json({ ok: true });
  } catch (caught) { if (caught instanceof Error && caught.message === "Invalid anime tag") return error("選取的標籤不存在。", 400); return error("無法更新動漫資料，請稍後再試。", 503); }
}

export async function DELETE(request: NextRequest) { const context = await getSecurityContext(); if (!context) return error("Unauthorized", 401); const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return error("找不到要移除的動漫。", 400); try { const { error: deleteError } = await createAdminClient().from("anime_library").update({ deleted_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("user_id", context.userId).is("deleted_at", null); if (deleteError) throw deleteError; return NextResponse.json({ ok: true }); } catch { return error("無法移除動漫。", 503); } }
