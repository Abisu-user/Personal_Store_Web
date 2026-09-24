import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";
import { hasAdultContentAccess } from "@/lib/security/adult-content";
import { getAnime1Index } from "@/lib/anime/anime1-index";
import { matchAnime1 } from "@/lib/anime/anime-title-matcher";
import { matchHAnime1Batch } from "@/lib/anime/hanime1-service";
import type { ExternalAnime } from "@/lib/anime/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const payloadSchema = z.object({
  scope: z.enum(["standard", "adult"]),
  ids: z.array(z.string().uuid()).min(1).max(24),
});

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toExternal(row: Record<string, unknown>): ExternalAnime | null {
  const source = row.external_source;
  if (source !== "anilist" && source !== "jikan" && source !== "bangumi") return null;
  return {
    id: String(row.external_id ?? ""),
    source,
    title: String(row.title ?? "未命名動漫"),
    titleJapanese: asText(row.title_japanese),
    titleEnglish: asText(row.title_english),
    titleChinese: asText(row.title_chinese),
    originalTitle: asText(row.original_title),
    coverUrl: null,
    bannerUrl: null,
    synopsis: null,
    animeType: null,
    broadcastStatus: null,
    episodes: null,
    episodeDuration: null,
    releaseYear: typeof row.release_year === "number" ? row.release_year : null,
    season: asText(row.season),
    startDate: null,
    endDate: null,
    ageRating: null,
    sourceMaterial: null,
    publicScore: null,
    genres: [],
    studios: [],
    relations: [],
    isAdult: Boolean(row.is_adult),
    contentRating: asText(row.content_rating),
    externalUrl: null,
    titleUserPreferred: asText(row.title),
    synonyms: [],
  };
}

export async function POST(request: NextRequest) {
  const security = await getSecurityContext();
  if (!security) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "無法確認收藏來源。" }, { status: 400 });
  if (parsed.data.scope === "adult" && !(await hasAdultContentAccess(security.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("anime_library")
    .select("id,external_id,external_source,title,title_japanese,title_english,title_chinese,original_title,release_year,season,is_adult,content_rating,source_url")
    .eq("user_id", security.userId)
    .in("id", parsed.data.ids)
    .is("source_url", null)
    .is("deleted_at", null);
  query = parsed.data.scope === "adult"
    ? query.eq("is_adult", true)
    : query.or("is_adult.is.null,is_adult.eq.false");
  const { data: rows, error } = await query;
  if (error) {
    console.warn("[anime-source-backfill] library query failed", { code: error.code, message: error.message });
    return NextResponse.json({ matches: [] });
  }

  const candidates = (rows ?? []).flatMap((row) => {
    const anime = toExternal(row);
    return anime ? [{ row, anime }] : [];
  });
  const adultMatches = parsed.data.scope === "adult"
    ? await matchHAnime1Batch(candidates.map(({ anime }) => anime))
    : null;
  const anime1Index = parsed.data.scope === "standard" ? await getAnime1Index() : null;
  const matches: Array<{ id: string; sourceUrl: string; source: "anime1" | "hanime1" }> = [];

  for (const { row, anime } of candidates) {
    const availability = parsed.data.scope === "adult"
      ? adultMatches?.get(anime.id)
      : matchAnime1(anime, anime1Index?.rows ?? [], anime1Index?.sourceAvailable ?? false);
    if (availability?.status !== "available" || !availability.url) continue;
    const updates = parsed.data.scope === "adult"
      ? { source_url: availability.url, external_url: availability.url, adult_source: "hanime1" }
      : { source_url: availability.url };
    const { data: updated, error: updateError } = await admin
      .from("anime_library")
      .update(updates)
      .eq("id", row.id)
      .eq("user_id", security.userId)
      .is("source_url", null)
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.warn("[anime-source-backfill] update failed", { code: updateError.code, message: updateError.message, scope: parsed.data.scope });
      continue;
    }
    if (updated) matches.push({ id: row.id, sourceUrl: availability.url, source: availability.source });
  }

  return NextResponse.json({ matches }, { headers: { "Cache-Control": "private, no-store" } });
}
