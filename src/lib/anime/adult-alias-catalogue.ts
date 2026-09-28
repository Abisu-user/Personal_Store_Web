import "server-only";

import { adultAliasesForIds, searchAdultAliases } from "@/lib/anime/adult-alias-store";
import { getCatalogue, getVerifiedAdultAnimeByIds, type CatalogueFilters } from "@/lib/anime/anilist-catalogue";
import type { ExternalAnime } from "@/lib/anime/types";

/** Only this adult-only path consults the private alias index. */
export async function getAdultCatalogueWithAliases(filters: CatalogueFilters, userId: string) {
  const page = filters.page ?? 1;
  const [direct, aliasRanks] = await Promise.all([
    getCatalogue(filters),
    filters.search ? searchAdultAliases(userId, filters.search).catch((cause) => {
      console.warn("[adult-alias] lookup unavailable", { error: cause instanceof Error ? cause.name : "unknown" });
      return new Map<number, number>();
    }) : Promise.resolve(new Map<number, number>()),
  ]);
  // An adult alias may only resolve to AniList's adult Japanese-anime identity.
  // Existing provider fallbacks can keep the general catalogue alive, but must
  // not become authoritative adult alias results when AniList is unavailable.
  const directItems = direct.items.filter((anime) => anime.source === "anilist" && anime.isAdult && anime.countryOfOrigin === "JP");
  let matched: ExternalAnime[] = [];
  if (aliasRanks.size && page === 1) {
    matched = await getVerifiedAdultAnimeByIds([...aliasRanks.keys()], filters).catch((cause) => {
      console.warn("[adult-alias] AniList identity validation unavailable", { error: cause instanceof Error ? cause.name : "unknown" });
      return [];
    });
  }
  const combined = new Map<string, ExternalAnime>();
  for (const anime of directItems) {
    // Local aliases are injected on page one; later pages must not repeat them.
    if (page > 1 && aliasRanks.has(Number(anime.id))) continue;
    combined.set(anime.id, anime);
  }
  for (const anime of matched) {
    const previous = combined.get(anime.id);
    combined.set(anime.id, previous ? { ...anime,
      titleChinese: previous.titleChinese ?? anime.titleChinese,
      verifiedChineseTitle: previous.verifiedChineseTitle,
      verifiedChineseSource: previous.verifiedChineseSource,
    } : anime);
  }
  const items = [...combined.values()];
  if (filters.search && page === 1) {
    const directIds = new Set(directItems.map((anime) => anime.id));
    const score = (anime: ExternalAnime) => {
      const alias = aliasRanks.get(Number(anime.id)) ?? 0;
      return alias >= 3 ? alias : directIds.has(anime.id) ? 2 : alias;
    };
    items.sort((left, right) => score(right) - score(left));
  }
  try {
    const aliases = await adultAliasesForIds(userId, items.map((anime) => Number(anime.id)));
    for (const anime of items) anime.aliases = aliases.get(Number(anime.id)) ?? [];
  } catch (cause) {
    console.warn("[adult-alias] title aliases unavailable", { error: cause instanceof Error ? cause.name : "unknown" });
  }
  return {
    ...direct,
    items,
    total: (directItems.length ? direct.total : 0) + (page === 1 ? matched.filter((anime) => !directItems.some((item) => item.id === anime.id)).length : 0),
    hasNextPage: directItems.length ? direct.hasNextPage : false,
    totalExact: direct.totalExact && matched.length === 0,
  };
}
