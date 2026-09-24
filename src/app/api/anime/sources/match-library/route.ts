import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";
import { hasAdultContentAccess } from "@/lib/security/adult-content";
import { getAnime1Index } from "@/lib/anime/anime1-index";
import { EXTERNAL_SOURCE_MATCHING_VERSION, matchAnime1 } from "@/lib/anime/anime-title-matcher";
import { matchHAnime1Batch } from "@/lib/anime/hanime1-service";
import {
  shouldMatchWatchSource,
  WATCH_SOURCE_ERROR_RETRY_MS,
  WATCH_SOURCE_MATCHING_STALE_MS,
  type WatchSourceMatchState,
} from "@/lib/anime/watch-source-match-state";
import type { ExternalAnime } from "@/lib/anime/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const scopeSchema = z.enum(["standard", "adult"]);
const payloadSchema = z.union([
  z.object({ scope: scopeSchema, ids: z.array(z.string().uuid()).min(1).max(24) }),
  z.object({ scope: scopeSchema, scan: z.literal(true), cursor: z.string().uuid().nullable().optional() }),
]);
const SCAN_BATCH_SIZE = 12;

async function mapLimited<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const position = next++;
      results[position] = await task(items[position]!);
    }
  }));
  return results;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isProviderUrl(value: unknown, hostname: string) {
  if (typeof value !== "string" || !value) return false;
  try {
    const actual = new URL(value).hostname.replace(/^www\./, "");
    return actual === hostname || actual.endsWith(`.${hostname}`);
  } catch {
    return false;
  }
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
  const ids = "ids" in parsed.data ? parsed.data.ids : null;
  const cursor = "cursor" in parsed.data ? parsed.data.cursor ?? null : null;
  const scan = ids === null;
  let scanIds: string[] = [];
  if (scan) {
    const errorCutoff = new Date(Date.now() - WATCH_SOURCE_ERROR_RETRY_MS).toISOString();
    const matchingCutoff = new Date(Date.now() - WATCH_SOURCE_MATCHING_STALE_MS).toISOString();
    let pending = admin.from("anime_watch_source_matches")
      .select("anime_id")
      .eq("user_id", security.userId)
      .or(`status.eq.unknown,and(status.eq.not_found,match_version.lt.${EXTERNAL_SOURCE_MATCHING_VERSION}),and(status.eq.ambiguous,match_version.lt.${EXTERNAL_SOURCE_MATCHING_VERSION}),and(status.eq.error,checked_at.lt.${errorCutoff}),and(status.eq.matching,checked_at.lt.${matchingCutoff})`)
      .order("anime_id", { ascending: true }).limit(SCAN_BATCH_SIZE);
    if (cursor) pending = pending.gt("anime_id", cursor);
    const { data: pendingRows, error: pendingError } = await pending;
    if (pendingError) {
      console.warn("[anime-source-backfill] queue query failed", { code: pendingError.code, message: pendingError.message });
      return NextResponse.json({ error: "無法取得待比對的收藏。" }, { status: 503 });
    }
    scanIds = (pendingRows ?? []).map((row) => row.anime_id);
    if (!scanIds.length) return NextResponse.json({
      matches: [], cursor, hasMore: false,
      progress: { processed: 0, matched: 0, notFound: 0, ambiguous: 0, errors: 0 },
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
  let query = admin
    .from("anime_library")
    .select("id,external_id,external_source,title,title_japanese,title_english,title_chinese,original_title,release_year,season,is_adult,content_rating,source_url,external_url,adult_source")
    .eq("user_id", security.userId)
    .is("deleted_at", null);
  if (scan) {
    // Only queued IDs are fetched. Changing a match status shrinks this set,
    // but the UUID cursor never skips the next unprocessed item.
    query = query.in("id", scanIds);
  } else {
    query = query.in("id", ids);
  }
  query = parsed.data.scope === "adult"
    ? query.eq("is_adult", true)
    : query.or("is_adult.is.null,is_adult.eq.false").is("source_url", null);
  const { data: rows, error } = await query;
  if (error) {
    console.warn("[anime-source-backfill] library query failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "無法取得待比對的收藏。" }, { status: 503 });
  }

  const eligibleRows = (rows ?? []).filter((row) => {
    if (parsed.data.scope === "adult" && (
      isProviderUrl(row.source_url, "hanime1.me") ||
      isProviderUrl(row.external_url, "hanime1.me")
    )) return false;
    return row.external_source === "anilist" || row.external_source === "jikan" || row.external_source === "bangumi";
  });
  const matches: Array<{ id: string; matchedUrl: string; destination: "source" | "external"; source: "anime1" | "hanime1" }> = [];
  const progress = { processed: 0, matched: 0, notFound: 0, ambiguous: 0, errors: 0 };

  if (eligibleRows.length) {
    const animeIds = eligibleRows.map((row) => row.id);
    const { data: storedStates, error: stateError } = await admin
      .from("anime_watch_source_matches")
      .select("anime_id,status,match_version,checked_at")
      .eq("user_id", security.userId)
      .in("anime_id", animeIds);
    if (stateError) {
      console.warn("[anime-source-backfill] state query failed", { code: stateError.code, message: stateError.message });
      return NextResponse.json({ error: "觀看來源狀態尚未啟用。" }, { status: 503 });
    }
    const stateById = new Map(((storedStates ?? []) as WatchSourceMatchState[]).map((state) => [state.anime_id, state]));
    const missingIds = animeIds.filter((animeId) => !stateById.has(animeId));
    if (missingIds.length) {
      const { error: seedError } = await admin.from("anime_watch_source_matches").upsert(
        missingIds.map((animeId) => ({ anime_id: animeId, user_id: security.userId })),
        { onConflict: "anime_id", ignoreDuplicates: true },
      );
      if (seedError) {
        console.warn("[anime-source-backfill] state seed failed", { code: seedError.code, message: seedError.message });
        return NextResponse.json({ error: "無法建立觀看來源狀態。" }, { status: 503 });
      }
      missingIds.forEach((animeId) => stateById.set(animeId, {
        anime_id: animeId, status: "unknown", match_version: 0, checked_at: null,
      }));
    }

    const now = Date.now();
    const claimedRows = await mapLimited(eligibleRows, 4, async (row) => {
      const state = stateById.get(row.id);
      if (!state || !shouldMatchWatchSource(state, now, EXTERNAL_SOURCE_MATCHING_VERSION)) return null;
      const anime = toExternal(row);
      if (!anime) return null;
      // Claim one record before contacting the provider. A competing visible
      // page or scan request cannot match the same unknown item twice.
      let claim = admin.from("anime_watch_source_matches")
        .update({ status: "matching", match_version: EXTERNAL_SOURCE_MATCHING_VERSION, checked_at: new Date(now).toISOString() })
        .eq("anime_id", row.id).eq("user_id", security.userId)
        .eq("status", state.status).eq("match_version", state.match_version);
      claim = state.checked_at ? claim.eq("checked_at", state.checked_at) : claim.is("checked_at", null);
      const { data: claimed, error: claimError } = await claim.select("anime_id").maybeSingle();
      if (claimError) {
        console.warn("[anime-source-backfill] claim failed", { code: claimError.code, message: claimError.message });
        progress.errors += 1;
        return null;
      }
      return claimed ? { row, anime } : null;
    });
    const candidates = claimedRows.filter((value): value is NonNullable<typeof value> => value !== null);

    const adultMatches = parsed.data.scope === "adult" && candidates.length
      ? await matchHAnime1Batch(candidates.map(({ anime }) => anime))
      : null;
    const anime1Index = parsed.data.scope === "standard" && candidates.length ? await getAnime1Index() : null;

    await mapLimited(candidates, 4, async ({ row, anime }) => {
      const availability = parsed.data.scope === "adult"
        ? adultMatches?.get(`${anime.source}:${anime.id}`)
        : matchAnime1(anime, anime1Index?.rows ?? [], anime1Index?.sourceAvailable ?? false);
      progress.processed += 1;
      const status = availability?.status === "available" && availability.url
        ? "matched"
        : availability?.status === "not_found" ? "not_found"
          : availability?.status === "unknown" ? "ambiguous" : "error";
      if (status === "not_found") progress.notFound += 1;
      if (status === "ambiguous") progress.ambiguous += 1;
      if (status === "error") progress.errors += 1;
      let savedMatch = false;
      if (status === "matched" && availability?.url) {
        const existingSource = asText(row.source_url);
        // Keep a custom watch URL. Replace only missing or AniList metadata URLs.
        const invalidMetadataSource = parsed.data.scope === "adult" && isProviderUrl(existingSource, "anilist.co");
        const destination = parsed.data.scope === "adult" && existingSource && !invalidMetadataSource
          ? "external" : "source";
        const updates = parsed.data.scope === "adult"
          ? existingSource && !invalidMetadataSource
            ? { external_url: availability.url }
            : { source_url: availability.url, external_url: availability.url, adult_source: "hanime1" }
          : { source_url: availability.url };
        let updateQuery = admin.from("anime_library").update(updates)
          .eq("id", row.id).eq("user_id", security.userId);
        updateQuery = existingSource ? updateQuery.eq("source_url", existingSource) : updateQuery.is("source_url", null);
        const { data: updated, error: updateError } = await updateQuery.select("id").maybeSingle();
        if (updateError) {
          console.warn("[anime-source-backfill] update failed", { code: updateError.code, message: updateError.message, scope: parsed.data.scope });
          progress.errors += 1;
        } else if (updated) {
          savedMatch = true;
          progress.matched += 1;
          matches.push({ id: row.id, matchedUrl: availability.url, destination, source: availability.source });
        } else progress.errors += 1;
      }
      const finalStatus = status === "matched" && !savedMatch ? "error" : status;
      const { error: stateUpdateError } = await admin.from("anime_watch_source_matches")
        .update({ status: finalStatus, match_version: EXTERNAL_SOURCE_MATCHING_VERSION, checked_at: new Date().toISOString() })
        .eq("anime_id", row.id).eq("user_id", security.userId).eq("status", "matching");
      if (stateUpdateError) {
        console.warn("[anime-source-backfill] state update failed", { code: stateUpdateError.code, message: stateUpdateError.message });
        progress.errors += 1;
      }
    });
  }

  return NextResponse.json({
    matches,
    ...(scan ? {
      cursor: scanIds.at(-1) ?? cursor,
      hasMore: scanIds.length === SCAN_BATCH_SIZE,
      progress,
    } : {}),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
