import type { AnimeSourceAvailability, ExternalAnime } from "@/lib/anime/types";

const resultCache = new Map<string, NonNullable<ExternalAnime["sourceAvailability"]>>();
const MATCHING_VERSION = 2;

function itemKey(provider: "anime1" | "hanime1", item: ExternalAnime) {
  return `v${MATCHING_VERSION}:${provider}:${item.source}:${item.id}`;
}

function requestKey(item: Pick<ExternalAnime, "source" | "id">) {
  return `${item.source}:${item.id}`;
}

function errorAvailability(source: AnimeSourceAvailability["source"]): AnimeSourceAvailability {
  return { source, status: "error", title: null, url: null, episodeText: null, year: null, seasonText: null, subtitleGroup: null };
}

export function markSourceAvailabilityChecking(items: ExternalAnime[], adult = false) {
  const source: AnimeSourceAvailability["source"] = adult ? "hanime1" : "anime1";
  return items.map((item) => ({
    ...item,
    sourceAvailability: { ...errorAvailability(source), status: "checking" as const },
  }));
}

function cacheResult(key: string, availability: AnimeSourceAvailability) {
  if (availability.status === "available" || availability.status === "not_found") {
    resultCache.set(key, availability);
  }
}

type MatchResponse = {
  matches?: Array<{
    id: string;
    availability: NonNullable<ExternalAnime["sourceAvailability"]>;
  }>;
};

export async function enrichAnime1Availability(items: ExternalAnime[]) {
  const candidates = items.filter((item) => ["anilist", "jikan", "bangumi"].includes(item.source));
  if (!candidates.length) return items;

  const availability = new Map<string, NonNullable<ExternalAnime["sourceAvailability"]>>();
  for (let start = 0; start < candidates.length; start += 30) {
    const batch = candidates.slice(start, start + 30);
    const missing = batch.filter((item) => !resultCache.has(itemKey("anime1", item)));
    batch.forEach((item) => {
      const cached = resultCache.get(itemKey("anime1", item));
      if (cached) availability.set(requestKey(item), cached);
    });
    if (!missing.length) continue;
    try {
      const response = await fetch("/api/anime/sources/anime1/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: missing.map(({ id, source, title, titleChinese, titleJapanese, titleEnglish, originalTitle, titleUserPreferred, synonyms, releaseYear, season }) => ({
            id, matchKey: requestKey({ id, source }), source, title, titleChinese, titleJapanese, titleEnglish, originalTitle, titleUserPreferred, synonyms, releaseYear, season,
          })),
        }),
      });
      if (!response.ok) throw new Error(`Anime1 match returned ${response.status}`);
      const body = (await response.json()) as MatchResponse;
      body.matches?.forEach((match) => {
        const item = missing.find((candidate) => requestKey(candidate) === match.id);
        if (item) cacheResult(itemKey("anime1", item), match.availability);
        availability.set(match.id, match.availability);
      });
    } catch {
      missing.forEach((item) => availability.set(requestKey(item), errorAvailability("anime1")));
    }
  }
  return items.map((item) =>
    availability.has(requestKey(item))
      ? { ...item, sourceAvailability: availability.get(requestKey(item)) }
      : item,
  );
}

export async function enrichHAnime1Availability(items: ExternalAnime[]) {
  if (!items.length) return items;
  const availability = new Map<string, NonNullable<ExternalAnime["sourceAvailability"]>>();
  for (let start = 0; start < items.length; start += 24) {
    const batch = items.slice(start, start + 24);
    const missing = batch.filter((item) => !resultCache.has(itemKey("hanime1", item)));
    batch.forEach((item) => {
      const cached = resultCache.get(itemKey("hanime1", item));
      if (cached) availability.set(requestKey(item), cached);
    });
    if (!missing.length) continue;
    try {
      const response = await fetch("/api/anime/sources/hanime1/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: missing.map(({ id, source, title, titleChinese, titleJapanese, titleEnglish, originalTitle, titleUserPreferred, synonyms, releaseYear, season }) => ({ id, matchKey: `${source}:${id}`, source, title, titleChinese, titleJapanese, titleEnglish, originalTitle, titleUserPreferred, synonyms, releaseYear, season })) }),
      });
      if (!response.ok) throw new Error(`hanime1 match returned ${response.status}`);
      const body = (await response.json()) as MatchResponse;
      body.matches?.forEach((match) => {
        const item = missing.find((candidate) => requestKey(candidate) === match.id);
        if (item) cacheResult(itemKey("hanime1", item), match.availability);
        availability.set(match.id, match.availability);
      });
    } catch {
      missing.forEach((item) => availability.set(requestKey(item), errorAvailability("hanime1")));
    }
  }
  return items.map((item) => availability.has(requestKey(item))
    ? { ...item, sourceAvailability: availability.get(requestKey(item)) }
    : item);
}
