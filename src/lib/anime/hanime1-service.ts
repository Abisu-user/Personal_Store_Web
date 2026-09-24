import "server-only";

import {
  buildAnimeTitleAliases,
  externalSourceStatus,
  matchExternalAnimeSource,
  normalizeAnimeTitle,
  type Anime1MatchRow,
} from "@/lib/anime/anime-title-matcher";
import type { AnimeSourceAvailability, ExternalAnime } from "@/lib/anime/types";

const SEARCH_ROOT = "https://hanime1.me/search";
const CACHE_TTL_MS = 12 * 60 * 60_000;
const SOURCE_BACKOFF_MS = 15 * 60_000;
const cache = new Map<string, { until: number; rows: Anime1MatchRow[] }>();
const inflight = new Map<string, Promise<Anime1MatchRow[]>>();
let sourceUnavailableUntil = 0;

function decode(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLocaleLowerCase()] ?? "";
  });
}

function plain(value: string) {
  return decode(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseSearch(html: string) {
  const rows = new Map<string, Anime1MatchRow>();
  for (const match of html.matchAll(/<a\b([^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] ?? "";
    const href = match[2] ?? match[3];
    if (!href || !/\/watch\?v=/i.test(href)) continue;
    let url: URL;
    try { url = new URL(decode(href), SEARCH_ROOT); } catch { continue; }
    if (url.protocol !== "https:" || url.hostname !== "hanime1.me") continue;
    const titleAttribute = attrs.match(/\btitle\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    const sourceTitle = plain(titleAttribute?.[1] ?? titleAttribute?.[2] ?? match[4] ?? "");
    if (!sourceTitle || sourceTitle.length > 500) continue;
    url.hash = "";
    rows.set(url.toString(), {
      sourceTitle,
      normalizedTitle: normalizeAnimeTitle(sourceTitle).normalized,
      sourceUrl: url.toString(),
      episodeText: null,
      year: null,
      seasonText: null,
      subtitleGroup: null,
      anilistId: null,
      manualMatch: false,
    });
  }
  return [...rows.values()];
}

async function requestSearch(title: string) {
  if (sourceUnavailableUntil > Date.now()) {
    throw new Error("hanime1 is temporarily unavailable");
  }
  const key = normalizeAnimeTitle(title).normalized;
  const url = new URL(SEARCH_ROOT);
  url.searchParams.set("query", title);
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Personal-Store/1.0 (optional public watch-source lookup)",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(5_500),
  });
  if (!response.ok || new URL(response.url).hostname !== "hanime1.me") {
    if ([403, 429, 503].includes(response.status)) {
      sourceUnavailableUntil = Date.now() + SOURCE_BACKOFF_MS;
    }
    throw new Error(`hanime1 returned ${response.status}`);
  }
  const rows = parseSearch(await response.text());
  cache.set(key, { until: Date.now() + CACHE_TTL_MS, rows });
  return rows;
}

async function search(title: string) {
  const key = normalizeAnimeTitle(title).normalized;
  const saved = cache.get(key);
  if (saved && saved.until > Date.now()) return saved.rows;
  const active = inflight.get(key);
  if (active) return active;
  const task = requestSearch(title).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

export async function matchHAnime1(anime: ExternalAnime): Promise<AnimeSourceAvailability> {
  const rows = new Map<string, Anime1MatchRow>();
  let completedSearches = 0;
  let failedSearches = 0;
  for (const title of buildAnimeTitleAliases(anime).slice(0, 8)) {
    try {
      const matches = await search(title);
      completedSearches += 1;
      matches.forEach((row) => rows.set(row.sourceUrl, row));
      const availability = matchExternalAnimeSource("hanime1", anime, [...rows.values()], true);
      if (availability.status === "available") return availability;
    } catch (error) {
      failedSearches += 1;
      console.warn("[hanime1-match] search failed", {
        title,
        message: error instanceof Error ? error.message : "unknown",
      });
      // Optional source failure must never block Anime Library.
      if (sourceUnavailableUntil > Date.now()) break;
    }
  }
  // A timeout, parser failure or rate limit is not evidence that a work is
  // absent.  Only a fully completed set of searches may become not_found.
  if (!completedSearches || failedSearches) return externalSourceStatus("hanime1", "error");
  return matchExternalAnimeSource("hanime1", anime, [...rows.values()], true);
}

export async function matchHAnime1Batch(items: ExternalAnime[]) {
  const result = new Map<string, AnimeSourceAvailability>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(3, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index]!;
      result.set(`${item.source}:${item.id}`, await matchHAnime1(item));
    }
  });
  await Promise.all(workers);
  return result;
}
