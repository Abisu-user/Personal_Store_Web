import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Anime1MatchRow } from "@/lib/anime/anime-title-matcher";
import { parseAnime1Index } from "@/lib/anime/anime1-parser";

const INDEX_URL = "https://anime1.me/動畫列表";
const CACHE_TTL_MS = 12 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 6_000;
let refreshPromise: Promise<Anime1MatchRow[]> | null = null;

type StoredRow = {
  source_title: string;
  normalized_title: string;
  source_url: string;
  episode_text: string | null;
  year: number | null;
  season_text: string | null;
  subtitle_group: string | null;
  anilist_id: number | null;
  manual_match: boolean;
  refreshed_at: string;
};

function mapStored(row: StoredRow): Anime1MatchRow {
  return { sourceTitle: row.source_title, normalizedTitle: row.normalized_title, sourceUrl: row.source_url, episodeText: row.episode_text, year: row.year, seasonText: row.season_text, subtitleGroup: row.subtitle_group, anilistId: row.anilist_id, manualMatch: row.manual_match };
}

async function readCache() {
  const admin = createAdminClient();
  const rows: StoredRow[] = [];
  let cursor: string | null = null;
  // Supabase may cap every REST response at 1,000 rows even when limit(5000)
  // is requested. Read the whole index in stable URL order instead.
  for (let batch = 0; batch < 100; batch += 1) {
    let query = admin.from("anime_external_sources")
      .select("source_title,normalized_title,source_url,episode_text,year,season_text,subtitle_group,anilist_id,manual_match,refreshed_at")
      .eq("source", "anime1")
      .eq("is_active", true)
      .order("source_url", { ascending: true })
      .limit(500);
    if (cursor) query = query.gt("source_url", cursor);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as StoredRow[];
    rows.push(...page);
    if (page.length < 500) {
      const refreshedAt = rows.length
        ? Math.max(...rows.map((row) => Date.parse(row.refreshed_at))) : 0;
      return { rows: rows.map(mapStored), fresh: refreshedAt > Date.now() - CACHE_TTL_MS };
    }
    const nextCursor = page.at(-1)?.source_url ?? null;
    if (!nextCursor || nextCursor === cursor) throw new Error("Anime1 index cursor did not advance");
    cursor = nextCursor;
  }
  throw new Error("Anime1 index exceeded the safe scan limit");
}

async function fetchAndPersist() {
  const startedAt = new Date().toISOString();
  const response = await fetch(INDEX_URL, {
    headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Personal-Store/1.0 (public anime availability index; 12-hour cache)" },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok || new URL(response.url).hostname !== "anime1.me") throw new Error(`Anime1 index returned ${response.status}`);
  const html = await response.text();
  const parsed = parseAnime1Index(html, response.url);
  if (!parsed.length) throw new Error("Anime1 index did not contain usable public entries");
  const admin = createAdminClient();
  for (let offset = 0; offset < parsed.length; offset += 400) {
    const batch = parsed.slice(offset, offset + 400).map((row) => ({
      source: "anime1",
      source_item_key: row.sourceItemKey,
      source_title: row.sourceTitle,
      normalized_title: row.normalizedTitle,
      source_url: row.sourceUrl,
      episode_text: row.episodeText,
      year: row.year,
      season_text: row.seasonText,
      subtitle_group: row.subtitleGroup,
      is_active: true,
      last_seen_at: startedAt,
      refreshed_at: startedAt,
    }));
    const { error } = await admin.from("anime_external_sources").upsert(batch, { onConflict: "source,source_url" });
    if (error) throw error;
  }
  // Deactivate entries absent from a fully parsed refresh; do not delete them,
  // preserving manual mappings and a recoverable audit trail.
  const { error: staleError } = await admin.from("anime_external_sources")
    .update({ is_active: false, refreshed_at: startedAt })
    .eq("source", "anime1")
    .eq("manual_match", false)
    .lt("last_seen_at", startedAt);
  if (staleError) throw staleError;
  console.info("[anime1-index] public index refreshed", { rowCount: parsed.length, cacheHours: CACHE_TTL_MS / 3_600_000 });
  return parsed.map((row) => ({ sourceTitle: row.sourceTitle, normalizedTitle: row.normalizedTitle, sourceUrl: row.sourceUrl, episodeText: row.episodeText, year: row.year, seasonText: row.seasonText, subtitleGroup: row.subtitleGroup, anilistId: row.anilistId, manualMatch: row.manualMatch }));
}

async function refresh() {
  if (!refreshPromise) refreshPromise = fetchAndPersist().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function getAnime1Index(): Promise<{ rows: Anime1MatchRow[]; sourceAvailable: boolean; stale: boolean }> {
  let cached: Awaited<ReturnType<typeof readCache>> | null = null;
  try { cached = await readCache(); }
  catch (error) {
    console.warn("[anime1-index] persistent cache unavailable", { code: (error as { code?: string })?.code ?? null, message: error instanceof Error ? error.message : "unknown" });
  }
  if (cached?.fresh) return { rows: cached.rows, sourceAvailable: true, stale: false };
  try { return { rows: await refresh(), sourceAvailable: true, stale: false }; }
  catch (error) {
    console.warn("[anime1-index] refresh unavailable", { message: error instanceof Error ? error.message : "unknown", usingStaleRows: Boolean(cached?.rows.length) });
    return cached?.rows.length ? { rows: cached.rows, sourceAvailable: true, stale: true } : { rows: [], sourceAvailable: false, stale: false };
  }
}
