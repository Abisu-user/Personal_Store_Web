import type { ExternalAnime } from "@/lib/anime/types";

const resultCache = new Map<string, NonNullable<ExternalAnime["sourceAvailability"]>>();

type MatchResponse = {
  matches?: Array<{
    id: string;
    availability: NonNullable<ExternalAnime["sourceAvailability"]>;
  }>;
};

export async function enrichAnime1Availability(items: ExternalAnime[]) {
  const candidates = items.filter((item) => ["anilist", "jikan", "bangumi"].includes(item.source));
  if (!candidates.length) return items;

  const availability = new Map<
    string,
    NonNullable<ExternalAnime["sourceAvailability"]>
  >();
  for (let start = 0; start < candidates.length; start += 30) {
    const batch = candidates.slice(start, start + 30);
    const missing = batch.filter((item) => !resultCache.has(`${item.source}:${item.id}`));
    batch.forEach((item) => {
      const cached = resultCache.get(`${item.source}:${item.id}`);
      if (cached) availability.set(item.id, cached);
    });
    if (!missing.length) continue;
    const response = await fetch("/api/anime/sources/anime1/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: missing.map(
          ({
            id,
            source,
            title,
            titleChinese,
            titleJapanese,
            titleEnglish,
            originalTitle,
            titleUserPreferred,
            synonyms,
            releaseYear,
            season,
          }) => ({
            id,
            source,
            title,
            titleChinese,
            titleJapanese,
            titleEnglish,
            originalTitle,
            titleUserPreferred,
            synonyms,
            releaseYear,
            season,
          }),
        ),
      }),
    });
    if (!response.ok) continue;
    const body = (await response.json()) as MatchResponse;
    body.matches?.forEach((match) => {
      const item = missing.find((candidate) => candidate.id === match.id);
      if (item) resultCache.set(`${item.source}:${item.id}`, match.availability);
      availability.set(match.id, match.availability);
    });
  }
  return items.map((item) =>
    availability.has(item.id)
      ? { ...item, sourceAvailability: availability.get(item.id) }
      : item,
  );
}

export async function enrichHAnime1Availability(items: ExternalAnime[]) {
  if (!items.length) return items;
  const availability = new Map<string, NonNullable<ExternalAnime["sourceAvailability"]>>();
  for (let start = 0; start < items.length; start += 24) {
    const batch = items.slice(start, start + 24);
    const missing = batch.filter((item) => !resultCache.has(`hanime1:${item.source}:${item.id}`));
    batch.forEach((item) => {
      const cached = resultCache.get(`hanime1:${item.source}:${item.id}`);
      if (cached) availability.set(item.id, cached);
    });
    if (!missing.length) continue;
    const response = await fetch("/api/anime/sources/hanime1/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: missing.map(({ id, source, title, titleChinese, titleJapanese, titleEnglish, originalTitle, titleUserPreferred, synonyms, releaseYear, season }) => ({ id, source, title, titleChinese, titleJapanese, titleEnglish, originalTitle, titleUserPreferred, synonyms, releaseYear, season })) }),
    });
    if (!response.ok) continue;
    const body = (await response.json()) as MatchResponse;
    body.matches?.forEach((match) => {
      const item = missing.find((candidate) => candidate.id === match.id);
      if (item) resultCache.set(`hanime1:${item.source}:${item.id}`, match.availability);
      availability.set(match.id, match.availability);
    });
  }
  return items.map((item) => availability.has(item.id)
    ? { ...item, sourceAvailability: availability.get(item.id) }
    : item);
}
