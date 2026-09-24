import type { ExternalAnime } from "@/lib/anime/types";

type MatchResponse = {
  matches?: Array<{
    id: string;
    availability: NonNullable<ExternalAnime["sourceAvailability"]>;
  }>;
};

export async function enrichAnime1Availability(items: ExternalAnime[]) {
  const candidates = items.filter((item) => item.source === "anilist");
  if (!candidates.length) return items;

  const availability = new Map<
    string,
    NonNullable<ExternalAnime["sourceAvailability"]>
  >();
  for (let start = 0; start < candidates.length; start += 30) {
    const batch = candidates.slice(start, start + 30);
    const response = await fetch("/api/anime/sources/anime1/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: batch.map(
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
    body.matches?.forEach((match) =>
      availability.set(match.id, match.availability),
    );
  }
  return items.map((item) =>
    availability.has(item.id)
      ? { ...item, sourceAvailability: availability.get(item.id) }
      : item,
  );
}
