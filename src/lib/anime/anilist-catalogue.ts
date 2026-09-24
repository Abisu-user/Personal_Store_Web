import "server-only";
import type { ExternalAnime } from "@/lib/anime/types";
import { localizeAnimeTitles } from "@/lib/anime/bangumi-title-localizer";
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
  format?: "TV" | "MOVIE" | "OVA" | "ONA" | "SPECIAL";
  status?: "RELEASING" | "FINISHED" | "NOT_YET_RELEASED";
  sort?:
    | "POPULARITY_DESC"
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
  id title { romaji english native } coverImage { extraLarge large } bannerImage description(asHtml: false)
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
function buildCatalogueQuery(filters: CatalogueFilters) {
  const variableTypes = [
    "$page: Int!",
    "$perPage: Int!",
    "$sort: [MediaSort!]",
  ];
  const mediaArguments = [
    "type: ANIME",
    `isAdult: ${filters.includeAdult ? "true" : "false"}`,
    "sort: $sort",
  ];
  const add = (name: string, type: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    variableTypes.push(`$${name}: ${type}`);
    mediaArguments.push(`${name}: $${name}`);
  };

  add("season", "MediaSeason", filters.season);
  add("seasonYear", "Int", filters.seasonYear);
  add("genre", "String", filters.genre);
  add("tag", "String", filters.tag);
  add("format", "MediaFormat", filters.format);
  add("status", "MediaStatus", filters.status);
  add("search", "String", filters.search);

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
    externalUrl: asText(row?.siteUrl),
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
    sort: [filters.sort ?? "POPULARITY_DESC"],
  };
  for (const [key, value] of Object.entries({
    season: filters.season,
    seasonYear: filters.seasonYear,
    genre: filters.genre,
    tag: filters.tag,
    format: filters.format,
    status: filters.status,
    search: filters.search,
  })) {
    if (value !== undefined && value !== null && value !== "")
      variables[key] = value;
  }
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
    ? data.Page.media.map(mapAnime).filter((item: ExternalAnime) => item.id)
    : [];
  const localized = await localizeAnimeTitles(items);
  // Keep provider popularity as the primary ranking. Japanese productions get
  // a small presentation priority without excluding animation from elsewhere.
  const ranked = localized
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        Number(right.item.countryOfOrigin === "JP") -
          Number(left.item.countryOfOrigin === "JP") ||
        left.index - right.index,
    )
    .map(({ item }) => item);
  return {
    items: ranked,
    page: Number(info?.currentPage ?? page),
    hasNextPage: Boolean(info?.hasNextPage),
    total: Number(info?.total ?? 0),
    totalExact: true,
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
        if (!item.id || item.isAdult) continue;
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

export async function getDiscoveryHome(
  timeZoneOffsetMinutes = 0,
): Promise<DiscoveryHome> {
  const current = currentSeason();
  const upcoming = nextSeason();
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
  const unavailable = jobs.flatMap((job, index) =>
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
  return {
    current: pageAt(0),
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
