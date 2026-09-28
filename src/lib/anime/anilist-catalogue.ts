import "server-only";
import type { ExternalAnime } from "@/lib/anime/types";
import {
  chineseSearchRelevance,
  isChineseAnimeSearch,
  localizeAnimeTitles,
  searchBangumiChineseCandidates,
  type BangumiChineseCandidate,
} from "@/lib/anime/bangumi-title-localizer";
import { buildAnimeTitleAliases, normalizeAnimeTitle } from "@/lib/anime/anime-title-matcher";
import {
  getKitsuCatalogue,
  getKitsuTaxonomy,
} from "@/lib/anime/kitsu-catalogue";
import { getBangumiCatalogue } from "@/lib/anime/bangumi-catalogue";
import { getShikimoriCatalogue } from "@/lib/anime/shikimori-catalogue";

const ANILIST_URL =
  process.env.ANIME_ANILIST_API_URL || "https://graphql.anilist.co";
const CATALOGUE_TTL = 45 * 60_000;
const FILTER_TTL = 15 * 60_000;
const TAXONOMY_TTL = 24 * 60 * 60_000;
const cache = new Map<string, { until: number; value: unknown }>();

export type CatalogueFilters = {
  page?: number;
  perPage?: number;
  season?: "WINTER" | "SPRING" | "SUMMER" | "FALL";
  seasonYear?: number;
  genre?: string;
  tag?: string;
  format?: "TV" | "TV_SHORT" | "MOVIE" | "OVA" | "ONA" | "SPECIAL";
  status?: "RELEASING" | "FINISHED" | "NOT_YET_RELEASED";
  minimumScore?: number;
  sort?:
    | "POPULARITY_DESC"
    | "SEARCH_MATCH"
    | "SCORE_DESC"
    | "START_DATE_DESC"
    | "NEXT_AIRING_EPISODE_DESC"
    | "TITLE_ROMAJI"
    | "FAVOURITES_DESC";
  includeAdult?: boolean;
  search?: string;
};
export type CataloguePage = {
  items: ExternalAnime[];
  page: number;
  hasNextPage: boolean;
  total: number;
  totalExact?: boolean;
};
export type CatalogueTaxonomy = { genres: string[]; tags: string[] };
export type DiscoveryHome = {
  current: CataloguePage;
  upcoming: CataloguePage;
  popular: CataloguePage;
  top: CataloguePage;
  schedule: ExternalAnime[];
  taxonomy: CatalogueTaxonomy;
  unavailable: string[];
};

const mediaFields = `
  id idMal title { romaji english native userPreferred } synonyms coverImage { extraLarge large } bannerImage description(asHtml: false)
  format status episodes duration season seasonYear startDate { year month day } endDate { year month day }
  averageScore popularity favourites countryOfOrigin genres studios { nodes { name } } source isAdult siteUrl
  nextAiringEpisode { episode airingAt timeUntilAiring }
`;

/**
 * AniList interprets a nullable variable explicitly passed as `null` as a
 * filter, rather than as an omitted filter.  Build the operation with only
 * the active filters so an unfiltered "popular" request does not become an
 * impossible `season = null` query.
 */
function activeMediaFilters(filters: CatalogueFilters) {
  return [
    ["season", "MediaSeason", filters.season],
    ["seasonYear", "Int", filters.seasonYear],
    ["genre", "String", filters.genre],
    ["tag", "String", filters.tag],
    ["format", "MediaFormat", filters.format],
    ["status", "MediaStatus", filters.status],
    ["averageScore_greater", "Int", filters.minimumScore === undefined ? undefined : filters.minimumScore * 10 - 1],
    ["search", "String", filters.search],
  ] as const;
}

function buildCatalogueQuery(filters: CatalogueFilters) {
  const variableTypes = [
    "$page: Int!",
    "$perPage: Int!",
    "$sort: [MediaSort!]",
  ];
  const mediaArguments = [
    "type: ANIME",
    "countryOfOrigin: JP",
    `isAdult: ${filters.includeAdult ? "true" : "false"}`,
    "sort: $sort",
  ];
  const add = (name: string, type: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    variableTypes.push(`$${name}: ${type}`);
    mediaArguments.push(`${name}: $${name}`);
  };

  activeMediaFilters(filters).forEach(([name, type, value]) => add(name, type, value));

  return `query AnimeCatalogue(${variableTypes.join(", ")}) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage total }
      media(${mediaArguments.join(", ")}) { ${mediaFields} }
    }
  }`;
}
const taxonomyQuery = `query AnimeTaxonomy {
  GenreCollection
  MediaTagCollection { name rank isMediaSpoiler category }
}`;
const seasonCountQuery = `query AnimeSeasonCount($page: Int!, $season: MediaSeason!, $year: Int!) {
  Page(page: $page, perPage: 50) {
    media(type: ANIME, countryOfOrigin: JP, isAdult: false, season: $season, seasonYear: $year) { id }
  }
}`;

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function date(value: any) {
  return value?.year
    ? `${value.year}-${String(value.month ?? 1).padStart(2, "0")}-${String(value.day ?? 1).padStart(2, "0")}`
    : null;
}
function mapAnime(row: any): ExternalAnime {
  return {
    id: String(row?.id ?? ""),
    source: "anilist",
    title:
      asText(row?.title?.romaji) ??
      asText(row?.title?.english) ??
      asText(row?.title?.native) ??
      "未命名動漫",
    titleJapanese: asText(row?.title?.native),
    titleEnglish: asText(row?.title?.english),
    titleChinese: null,
    originalTitle: asText(row?.title?.romaji),
    titleUserPreferred: asText(row?.title?.userPreferred),
    synonyms: Array.isArray(row?.synonyms)
      ? row.synonyms.filter((item: unknown): item is string => typeof item === "string" && Boolean(item.trim()))
      : [],
    malId: asNumber(row?.idMal),
    coverUrl:
      asText(row?.coverImage?.extraLarge) ?? asText(row?.coverImage?.large),
    bannerUrl: asText(row?.bannerImage) ?? asText(row?.coverImage?.extraLarge),
    synopsis: asText(row?.description),
    animeType: asText(row?.format),
    broadcastStatus: asText(row?.status),
    episodes: asNumber(row?.episodes),
    episodeDuration: asNumber(row?.duration),
    releaseYear: asNumber(row?.seasonYear) ?? asNumber(row?.startDate?.year),
    season: asText(row?.season)?.toLowerCase() ?? null,
    startDate: date(row?.startDate),
    endDate: date(row?.endDate),
    ageRating: null,
    sourceMaterial: asText(row?.source),
    publicScore:
      asNumber(row?.averageScore) === null
        ? null
        : (asNumber(row?.averageScore) ?? 0) / 10,
    popularity: asNumber(row?.popularity),
    countryOfOrigin: asText(row?.countryOfOrigin),
    genres: Array.isArray(row?.genres)
      ? row.genres.filter(
          (item: unknown): item is string => typeof item === "string",
        )
      : [],
    studios: Array.isArray(row?.studios?.nodes)
      ? row.studios.nodes.map((item: any) => asText(item?.name)).filter(Boolean)
      : [],
    relations: [],
    isAdult: Boolean(row?.isAdult),
    contentRating: row?.isAdult ? "成人內容" : null,
    // AniList's siteUrl is a metadata page, not an external watch source.
    externalUrl: null,
    nextAiringEpisode:
      row?.nextAiringEpisode &&
      asNumber(row.nextAiringEpisode.episode) !== null &&
      asNumber(row.nextAiringEpisode.airingAt) !== null
        ? {
            episode: Number(row.nextAiringEpisode.episode),
            airingAt: Number(row.nextAiringEpisode.airingAt),
            timeUntilAiring: Number(row.nextAiringEpisode.timeUntilAiring ?? 0),
          }
        : null,
  };
}

function candidateMatchScore(candidate: BangumiChineseCandidate, anime: ExternalAnime) {
  if (candidate.malId && anime.malId === candidate.malId) return 200;
  if (candidate.malId && anime.malId && candidate.malId !== anime.malId) return 0;
  if (candidate.year && anime.releaseYear && Math.abs(candidate.year - anime.releaseYear) > 1) return 0;
  const platform = candidate.format?.toLocaleLowerCase();
  const expectedFormat = platform === "tv" ? "TV"
    : platform === "web" ? "ONA"
      : platform === "剧场版" || platform === "劇場版" || platform === "movie" ? "MOVIE"
        : platform === "ova" || platform === "oad" ? "OVA" : null;
  if (expectedFormat && anime.animeType && anime.animeType !== expectedFormat && !(expectedFormat === "TV" && anime.animeType === "TV_SHORT")) return 0;
  if (candidate.episodes && anime.episodes && candidate.episodes !== anime.episodes) return 0;
  const names = [candidate.name, candidate.nameChinese].filter((name): name is string => Boolean(name));
  let titleScore = 0;
  const primaryAliases = new Set([anime.titleJapanese, anime.originalTitle, anime.titleEnglish, anime.title, anime.titleChinese]
    .filter((name): name is string => Boolean(name))
    .map((name) => normalizeAnimeTitle(name).normalized));
  const primaryBases = new Set([anime.titleJapanese, anime.originalTitle, anime.titleEnglish, anime.title, anime.titleChinese]
    .filter((name): name is string => Boolean(name))
    .map((name) => normalizeAnimeTitle(name).base));
  for (const name of names) {
    const subject = normalizeAnimeTitle(name);
    for (const alias of buildAnimeTitleAliases(anime)) {
      const provider = normalizeAnimeTitle(alias);
      if (subject.normalized && subject.normalized === provider.normalized)
        titleScore = Math.max(titleScore, primaryAliases.has(provider.normalized) ? 100 : expectedFormat && candidate.episodes ? 94 : 0);
      else if (subject.base && subject.base === provider.base && subject.seasonNumber === provider.seasonNumber)
        titleScore = Math.max(titleScore, primaryBases.has(provider.base) || expectedFormat && candidate.episodes ? 92 : 0);
    }
  }
  if (!titleScore) return 0;
  return titleScore + (candidate.year && anime.releaseYear ? 2 - Math.abs(candidate.year - anime.releaseYear) : 0);
}

function buildCandidateQuery(candidates: BangumiChineseCandidate[], filters: CatalogueFilters) {
  const activeFilters = activeMediaFilters(filters).filter(([name, , value]) => name !== "search" && value !== undefined && value !== null && value !== "");
  const definitions = activeFilters.map(([name, type]) => `$${name}: ${type}`);
  const variables: Record<string, unknown> = {};
  const mediaArguments = activeFilters.map(([name, , value]) => {
    variables[name] = value;
    return `${name}: $${name}`;
  });
  const pages = candidates.map((candidate, index) => {
    const key = candidate.malId ? `malId${index}` : `title${index}`;
    definitions.push(`$${key}: ${candidate.malId ? "Int" : "String"}!`);
    variables[key] = candidate.malId ?? candidate.name;
    const identity = `${candidate.malId ? "idMal" : "search"}: $${key}`;
    const argumentsList = ["type: ANIME", "countryOfOrigin: JP", `isAdult: ${Boolean(filters.includeAdult)}`, identity, "sort: [SEARCH_MATCH]", ...mediaArguments];
    return `candidate${index}: Page(page: 1, perPage: 4) {
      media(${argumentsList.join(", ")}) { ...CandidateMedia }
    }`;
  });
  return {
    query: `query ChineseAnimeCandidates(${definitions.join(", ")}) { ${pages.join("\n")} }
      fragment CandidateMedia on Media { ${mediaFields} }`,
    variables,
  };
}

async function matchBangumiCandidates(candidates: BangumiChineseCandidate[], filters: CatalogueFilters) {
  if (!candidates.length) return [];
  const { query, variables } = buildCandidateQuery(candidates, filters);
  try {
    const data = await request<Record<string, { media?: unknown[] }>>(query, variables, FILTER_TTL);
    const matches = candidates.flatMap((candidate, index) => {
      const rows = data[`candidate${index}`]?.media;
      const ranked = (Array.isArray(rows) ? rows : [])
        .map(mapAnime)
        .filter((anime) => anime.id && anime.isAdult === Boolean(filters.includeAdult) && anime.countryOfOrigin === "JP")
        .map((anime) => ({ anime, score: candidateMatchScore(candidate, anime) }))
        .filter(({ score }) => score >= 92)
        .sort((left, right) => right.score - left.score);
      const best = ranked[0];
      if (!best || (ranked[1] && best.score - ranked[1].score < 2)) return [];
      return [{
        ...best.anime,
        titleChinese: candidate.nameChinese ?? best.anime.titleChinese,
        verifiedChineseTitle: Boolean(candidate.nameChinese && candidate.malId && candidate.malId === best.anime.malId),
        verifiedChineseSource: candidate.nameChinese && candidate.malId === best.anime.malId ? String(candidate.id) : null,
      }];
    });
    const needle = normalizeAnimeTitle(filters.search ?? "").normalized.replace(/\s+/g, "");
    const relevance = (anime: ExternalAnime) => {
      const title = normalizeAnimeTitle(anime.titleChinese ?? "").normalized.replace(/\s+/g, "");
      return title === needle ? 3 : title.startsWith(needle) ? 2 : title.includes(needle) ? 1 : 0;
    };
    return matches.sort((left, right) => relevance(right) - relevance(left) || (right.popularity ?? 0) - (left.popularity ?? 0));
  } catch (cause) {
    console.warn("[anime-chinese-search] AniList candidate match unavailable", { message: cause instanceof Error ? cause.message : "unknown" });
    return [];
  }
}

async function request<T>(
  query: string,
  variables: Record<string, unknown>,
  ttl: number,
): Promise<T> {
  const key = JSON.stringify({ query, variables });
  const saved = cache.get(key);
  if (saved && saved.until > Date.now()) return saved.value as T;
  const response = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(7_000),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as any;
  const error = body?.errors
    ?.map((item: any) => asText(item?.message))
    .filter(Boolean)
    .join("; ");
  if (!response.ok || error) {
    console.error("[anilist-catalogue] request failed", {
      status: response.status,
      error: error ?? "unknown",
      duration: "within 7s",
    });
    throw new Error(
      response.status === 429
        ? "動漫資料查詢太頻繁，請稍後再試。"
        : "動漫資料目前無法載入，請稍後再試。",
    );
  }
  cache.set(key, { until: Date.now() + ttl, value: body.data });
  return body.data as T;
}

/** One AniList operation for all local-alias candidate IDs; never trust alias rows as metadata. */
export async function getVerifiedAdultAnimeByIds(ids: number[], filters: CatalogueFilters = {}) {
  const unique = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 24);
  if (!unique.length) return [];
  const definitions = ["$ids: [Int!]!"];
  const argumentsList = ["id_in: $ids", "type: ANIME", "countryOfOrigin: JP", "isAdult: true"];
  const variables: Record<string, unknown> = { ids: unique };
  for (const [name, type, value] of activeMediaFilters(filters)) {
    if (name === "search" || value === undefined || value === null || value === "") continue;
    definitions.push("$" + name + ": " + type);
    argumentsList.push(name + ": $" + name);
    variables[name] = value;
  }
  const query = "query AdultAliasMedia(" + definitions.join(", ") + ") { Page(page: 1, perPage: 30) { media(" +
    argumentsList.join(", ") + ") { " + mediaFields + " } } }";
  const data = await request<{ Page?: { media?: unknown[] } }>(query, variables, FILTER_TTL);
  return (Array.isArray(data?.Page?.media) ? data.Page.media : [])
    .map(mapAnime)
    .filter((anime) => anime.source === "anilist" && anime.isAdult && anime.countryOfOrigin === "JP");
}

export async function getCatalogue(
  filters: CatalogueFilters = {},
): Promise<CataloguePage> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const perPage = Math.min(30, Math.max(12, Math.floor(filters.perPage ?? 20)));
  const ttl =
    filters.season ||
    (!filters.genre && !filters.tag && !filters.format && !filters.status)
      ? CATALOGUE_TTL
      : FILTER_TTL;
  const variables: Record<string, unknown> = {
    page,
    perPage,
    // AniList MediaSort has no NEXT_AIRING_EPISODE_DESC value. Keep that
    // product-level choice, but send a supported sort to the provider.
    sort: [filters.sort === "NEXT_AIRING_EPISODE_DESC"
      ? "START_DATE_DESC"
      : filters.sort ?? "POPULARITY_DESC"],
  };
  for (const [key, , value] of activeMediaFilters(filters)) {
    if (value !== undefined && value !== null && value !== "")
      variables[key] = value;
  }
  const adultChineseSearch = Boolean(filters.includeAdult && filters.search && isChineseAnimeSearch(filters.search));
  const candidatesPromise = (page === 1 || adultChineseSearch) && filters.search && isChineseAnimeSearch(filters.search)
    ? searchBangumiChineseCandidates(filters.search, filters.includeAdult ? "adult" : "general")
    : null;
  let data: any;
  try {
    data = await request<any>(buildCatalogueQuery(filters), variables, ttl);
  } catch (cause) {
    console.warn(
      "[anime-catalogue] AniList unavailable; using catalogue fallback",
      {
        message: cause instanceof Error ? cause.message : "unknown",
        adult: Boolean(filters.includeAdult),
      },
    );
    if (filters.includeAdult)
      return getShikimoriCatalogue({ ...filters, page, perPage });
    try {
      // Shikimori follows MAL-style popularity/ranking and exposes future
      // seasons, which is much closer to the primary AniList catalogue.
      return await getShikimoriCatalogue({ ...filters, page, perPage });
    } catch (fallbackCause) {
      console.warn(
        "[anime-catalogue] Shikimori unavailable; using final fallbacks",
        {
          message:
            fallbackCause instanceof Error ? fallbackCause.message : "unknown",
        },
      );
      try {
        return await getBangumiCatalogue({ ...filters, page, perPage });
      } catch {
        return getKitsuCatalogue({ ...filters, page, perPage });
      }
    }
  }
  const info = data?.Page?.pageInfo;
  const items: ExternalAnime[] = Array.isArray(data?.Page?.media)
    ? data.Page.media
        .map(mapAnime)
        .filter((item: ExternalAnime) => item.id && item.countryOfOrigin === "JP" && (!filters.includeAdult || item.isAdult))
    : [];
  const candidates = candidatesPromise ? await candidatesPromise : [];
  const matched = candidates.length ? await matchBangumiCandidates(candidates, filters) : [];
  if (adultChineseSearch) {
    const injectedIds = new Set(matched.map((anime) => anime.id));
    const combined = new Map<string, ExternalAnime>();
    for (const anime of items) {
      // The candidate is shown on page one; do not repeat it on later pages.
      if (page === 1 || !injectedIds.has(anime.id)) combined.set(anime.id, anime);
    }
    if (page === 1) {
      const applied = new Set<string>();
      for (const anime of matched) {
        if (applied.has(anime.id)) continue;
        applied.add(anime.id);
        const original = combined.get(anime.id);
        combined.set(anime.id, original ? { ...original, titleChinese: anime.titleChinese ?? original.titleChinese } : anime);
      }
    }
    const localized = await localizeAnimeTitles([...combined.values()]);
    const scored = page === 1 && filters.sort === "SEARCH_MATCH"
      ? localized.map((anime, index) => ({
        anime, index,
        relevance: Math.max(
          chineseSearchRelevance(filters.search!, [anime.titleChinese]) * 10,
          chineseSearchRelevance(filters.search!, buildAnimeTitleAliases(anime)) * 5,
        ),
      })).sort((left, right) => right.relevance - left.relevance || left.index - right.index).map(({ anime }) => anime)
      : localized;
    return {
      items: scored,
      page: Number(info?.currentPage ?? page),
      hasNextPage: Boolean(info?.hasNextPage),
      total: Number(info?.total ?? 0) + (page === 1 ? Math.max(0, combined.size - items.length) : 0),
      totalExact: matched.length === 0,
    };
  }
  // Keep every AniList page-one row; adding candidates must not make page two skip any.
  const combined = new Map<string, ExternalAnime>();
  if (filters.sort === "SEARCH_MATCH") matched.forEach((anime) => {
    if (!combined.has(anime.id)) combined.set(anime.id, anime);
  });
  items.forEach((anime) => {
    const existing = combined.get(anime.id);
    combined.set(anime.id, existing ? { ...anime, titleChinese: existing.titleChinese ?? anime.titleChinese } : anime);
  });
  if (filters.sort !== "SEARCH_MATCH") matched.forEach((anime) => {
    if (!combined.has(anime.id)) combined.set(anime.id, anime);
  });
  const localized = await localizeAnimeTitles([...combined.values()]);
  return {
    items: localized,
    page: Number(info?.currentPage ?? page),
    hasNextPage: Boolean(info?.hasNextPage),
    total: Number(info?.total ?? 0) + Math.max(0, combined.size - items.length),
    totalExact: combined.size === items.length,
  };
}

function weekBounds(timeZoneOffsetMinutes: number, now = Date.now()) {
  const shifted = new Date(now - timeZoneOffsetMinutes * 60_000);
  const startAsUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - shifted.getUTCDay(),
  );
  const start = Math.floor(
    (startAsUtc + timeZoneOffsetMinutes * 60_000) / 1000,
  );
  return { start, end: start + 7 * 24 * 60 * 60 };
}

export async function getWeeklySchedule(
  timeZoneOffsetMinutes = 0,
): Promise<ExternalAnime[]> {
  const { start, end } = weekBounds(
    Math.max(-840, Math.min(840, timeZoneOffsetMinutes)),
  );
  const scheduleQuery = `query AnimeWeeklySchedule($page: Int!, $perPage: Int!, $start: Int!, $end: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage }
      airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
        episode airingAt timeUntilAiring media { ${mediaFields} }
      }
    }
  }`;
  try {
    const collected = new Map<string, ExternalAnime>();
    for (let page = 1; page <= 5; page += 1) {
      const data = await request<any>(
        scheduleQuery,
        { page, perPage: 50, start, end },
        FILTER_TTL,
      );
      const rows = Array.isArray(data?.Page?.airingSchedules)
        ? data.Page.airingSchedules
        : [];
      for (const row of rows) {
        const item = mapAnime(row?.media);
        if (!item.id || item.isAdult || item.countryOfOrigin !== "JP") continue;
        item.nextAiringEpisode = {
          episode: Number(row?.episode ?? 0),
          airingAt: Number(row?.airingAt ?? 0),
          timeUntilAiring: Number(row?.timeUntilAiring ?? 0),
        };
        const existing = collected.get(item.id);
        if (
          !existing ||
          item.nextAiringEpisode.airingAt <
            (existing.nextAiringEpisode?.airingAt ?? Infinity)
        )
          collected.set(item.id, item);
      }
      if (!data?.Page?.pageInfo?.hasNextPage) break;
    }
    return localizeAnimeTitles(
      [...collected.values()].sort(
        (left, right) =>
          (left.nextAiringEpisode?.airingAt ?? 0) -
          (right.nextAiringEpisode?.airingAt ?? 0),
      ),
    );
  } catch (cause) {
    console.warn(
      "[anime-schedule] dedicated schedule unavailable; using current catalogue",
      { message: cause instanceof Error ? cause.message : "unknown" },
    );
    const current = currentSeason();
    const fallback = await getCatalogue({
      season: current.season,
      seasonYear: current.year,
      status: "RELEASING",
      sort: "NEXT_AIRING_EPISODE_DESC",
      perPage: 30,
    });
    return fallback.items.filter((item) => {
      const airingAt = item.nextAiringEpisode?.airingAt ?? 0;
      return airingAt >= start && airingAt < end;
    });
  }
}

export type LatestAiredEpisode = {
  mediaId: number;
  episode: number;
  airedAt: number;
  broadcastStatus: string | null;
  totalEpisodes: number | null;
};

/** Resolve legacy Jikan/MAL library IDs through AniList's stable idMal field. */
export async function getAniListIdsForMalIds(malIds: number[]) {
  const ids = [...new Set(malIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const found = new Map<number, number>();
  if (!ids.length) return found;
  const query = `query AnimeMalIds($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(idMal_in: $ids, type: ANIME, isAdult: false) { id idMal }
    }
  }`;
  for (let offset = 0; offset < ids.length; offset += 40) {
    const batch = ids.slice(offset, offset + 40);
    const data = await request<{ Page?: { media?: Array<{ id?: number; idMal?: number }> } }>(
      query, { ids: batch }, CATALOGUE_TTL,
    );
    for (const media of data.Page?.media ?? []) {
      if (media.idMal && media.id && batch.includes(media.idMal)) found.set(media.idMal, media.id);
    }
  }
  return found;
}

/** AniList's past AiringSchedule is the only source of update timestamps here.
 * Missing history stays missing; nextAiringEpisode and DB updated_at are never substitutes.
 */
export async function getLatestAiredEpisodes(mediaIds: number[], now = Math.floor(Date.now() / 1000)) {
  const ids = [...new Set(mediaIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return new Map<number, LatestAiredEpisode>();
  const query = `query AnimeLatestAired($page: Int!, $ids: [Int], $start: Int!, $end: Int!) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      airingSchedules(mediaId_in: $ids, airingAt_greater: $start, airingAt_lesser: $end, sort: TIME_DESC) {
        mediaId episode airingAt media { id status episodes isAdult }
      }
    }
  }`;
  const bucketEnd = Math.ceil(now / 900) * 900;
  const start = bucketEnd - 45 * 86400;
  const found = new Map<number, LatestAiredEpisode>();
  type AiringResponse = { Page?: {
    pageInfo?: { hasNextPage?: boolean };
    airingSchedules?: Array<{
      mediaId?: number;
      episode?: number;
      airingAt?: number;
      media?: { id?: number; status?: string; episodes?: number | null; isAdult?: boolean };
    }>;
  } };
  for (let offset = 0; offset < ids.length; offset += 40) {
    const batch = ids.slice(offset, offset + 40);
    for (let page = 1; page <= 8; page += 1) {
      const data = await request<AiringResponse>(query, { page, ids: batch, start, end: bucketEnd }, FILTER_TTL);
      const rows = Array.isArray(data?.Page?.airingSchedules) ? data.Page.airingSchedules : [];
      for (const row of rows) {
        const id = Number(row?.mediaId);
        const airedAt = Number(row?.airingAt);
        const episode = Number(row?.episode);
        if (!batch.includes(id) || row?.media?.id !== id || row.media.isAdult !== false || !Number.isSafeInteger(episode) || episode < 1 ||
            !Number.isSafeInteger(airedAt) || airedAt > now || found.has(id)) continue;
        found.set(id, {
          mediaId: id,
          episode,
          airedAt,
          broadcastStatus: typeof row.media?.status === "string" ? row.media.status : null,
          totalEpisodes: typeof row.media?.episodes === "number" && Number.isSafeInteger(row.media.episodes) ? row.media.episodes : null,
        });
      }
      if (batch.every((id) => found.has(id)) || !data?.Page?.pageInfo?.hasNextPage) break;
    }
  }
  return found;
}

export async function getCatalogueTaxonomy(): Promise<CatalogueTaxonomy> {
  let data: any;
  try {
    data = await request<any>(taxonomyQuery, {}, TAXONOMY_TTL);
  } catch {
    return getKitsuTaxonomy();
  }
  const genres = Array.isArray(data?.GenreCollection)
    ? data.GenreCollection.filter(
        (item: unknown): item is string => typeof item === "string",
      ).sort()
    : [];
  const tags = Array.isArray(data?.MediaTagCollection)
    ? data.MediaTagCollection.filter(
        (item: any) =>
          typeof item?.name === "string" &&
          !item.isMediaSpoiler &&
          !String(item.category ?? "").includes("Sexual"),
      )
        .sort(
          (left: any, right: any) =>
            Number(right.rank ?? 0) - Number(left.rank ?? 0) ||
            String(left.name).localeCompare(String(right.name)),
        )
        .slice(0, 100)
        .map((item: any) => item.name)
    : [];
  return { genres, tags };
}

async function getCurrentSeasonCount(season: NonNullable<CatalogueFilters["season"]>, year: number) {
  let count = 0;
  // AniList currently returns 5000 for pageInfo.total even with season/year
  // and JP filters. Count the actual filtered IDs, not that metadata field.
  for (let page = 1; page <= 100; page += 1) {
    const data = await request<{ Page?: { media?: Array<{ id: number }> } }>(
      seasonCountQuery, { page, season, year }, CATALOGUE_TTL,
    );
    const rows = data?.Page?.media;
    if (!Array.isArray(rows)) throw new Error("本季作品數無法確認。");
    count += rows.length;
    if (rows.length < 50) return count;
  }
  throw new Error("本季作品數超過安全分頁上限。");
}

export async function getDiscoveryHome(
  timeZoneOffsetMinutes = 0,
): Promise<DiscoveryHome> {
  const localToday = new Date(Date.now() - timeZoneOffsetMinutes * 60_000);
  const current = currentSeason(localToday);
  const upcoming = nextSeason(localToday);
  const jobs = await Promise.allSettled([
    getCatalogue({
      season: current.season,
      seasonYear: current.year,
      sort: "NEXT_AIRING_EPISODE_DESC",
      perPage: 20,
    }),
    getCatalogue({
      season: upcoming.season,
      seasonYear: upcoming.year,
      sort: "POPULARITY_DESC",
      perPage: 12,
    }),
    getCatalogue({ sort: "POPULARITY_DESC", perPage: 12 }),
    getCatalogue({ sort: "SCORE_DESC", perPage: 12 }),
    getCatalogueTaxonomy(),
    getWeeklySchedule(timeZoneOffsetMinutes),
    getCurrentSeasonCount(current.season, current.year),
  ]);
  const empty: CataloguePage = {
    items: [],
    page: 1,
    hasNextPage: false,
    total: 0,
    totalExact: true,
  };
  const pageAt = (index: number) =>
    jobs[index]?.status === "fulfilled"
      ? (jobs[index].value as CataloguePage)
      : empty;
  const tax =
    jobs[4]?.status === "fulfilled"
      ? (jobs[4].value as CatalogueTaxonomy)
      : { genres: [], tags: [] };
  const unavailable = jobs.slice(0, 6).flatMap((job, index) =>
    job.status === "rejected"
      ? [
          index === 0
            ? "本季新番"
            : index === 1
              ? "下季新番"
              : index === 2
                ? "熱門動漫"
                : index === 3
                  ? "高評分動漫"
                  : index === 4
                    ? "分類"
                    : "本週時間表",
        ]
      : [],
  );
  const schedule =
    jobs[5]?.status === "fulfilled" ? (jobs[5].value as ExternalAnime[]) : [];
  const currentPage = pageAt(0);
  const currentWithCount = jobs[6]?.status === "fulfilled"
    ? { ...currentPage, total: jobs[6].value as number, totalExact: true }
    : { ...currentPage, total: currentPage.items.length, totalExact: !currentPage.hasNextPage };
  return {
    current: currentWithCount,
    upcoming: pageAt(1),
    popular: pageAt(2),
    top: pageAt(3),
    schedule,
    taxonomy: tax,
    unavailable,
  };
}

export function currentSeason(today = new Date()) {
  const month = today.getUTCMonth() + 1;
  const season =
    month <= 3
      ? "WINTER"
      : month <= 6
        ? "SPRING"
        : month <= 9
          ? "SUMMER"
          : "FALL";
  return {
    season: season as NonNullable<CatalogueFilters["season"]>,
    year: today.getUTCFullYear(),
  };
}
export function nextSeason(today = new Date()) {
  const current = currentSeason(today);
  const order: CatalogueFilters["season"][] = [
    "WINTER",
    "SPRING",
    "SUMMER",
    "FALL",
  ];
  const index = order.indexOf(current.season);
  return {
    season: order[(index + 1) % order.length]!,
    year: current.year + (current.season === "FALL" ? 1 : 0),
  };
}
