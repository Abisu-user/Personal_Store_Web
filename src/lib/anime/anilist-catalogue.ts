import "server-only";
import type { ExternalAnime } from "@/lib/anime/types";

const ANILIST_URL = process.env.ANIME_ANILIST_API_URL || "https://graphql.anilist.co";
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
  sort?: "POPULARITY_DESC" | "SCORE_DESC" | "START_DATE_DESC" | "NEXT_AIRING_EPISODE_DESC" | "TITLE_ROMAJI" | "FAVOURITES_DESC";
};
export type CataloguePage = { items: ExternalAnime[]; page: number; hasNextPage: boolean; total: number };
export type CatalogueTaxonomy = { genres: string[]; tags: string[] };

const catalogueQuery = `query AnimeCatalogue($page: Int!, $perPage: Int!, $season: MediaSeason, $seasonYear: Int, $genre: String, $tag: String, $format: MediaFormat, $status: MediaStatus, $sort: [MediaSort!]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { currentPage hasNextPage total }
    media(type: ANIME, isAdult: false, season: $season, seasonYear: $seasonYear, genre: $genre, tag: $tag, format: $format, status: $status, sort: $sort) {
      id title { romaji english native } coverImage { extraLarge large } bannerImage description(asHtml: false)
      format status episodes duration season seasonYear startDate { year month day } endDate { year month day }
      averageScore genres studios { nodes { name } } source
    }
  }
}`;
const taxonomyQuery = `query AnimeTaxonomy {
  GenreCollection
  MediaTagCollection { name rank isMediaSpoiler category }
}`;

function asText(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function asNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function date(value: any) { return value?.year ? `${value.year}-${String(value.month ?? 1).padStart(2, "0")}-${String(value.day ?? 1).padStart(2, "0")}` : null; }
function mapAnime(row: any): ExternalAnime {
  return {
    id: String(row?.id ?? ""), source: "anilist",
    title: asText(row?.title?.romaji) ?? asText(row?.title?.english) ?? asText(row?.title?.native) ?? "未命名動漫",
    titleJapanese: asText(row?.title?.native), titleEnglish: asText(row?.title?.english), titleChinese: null, originalTitle: asText(row?.title?.romaji),
    coverUrl: asText(row?.coverImage?.extraLarge) ?? asText(row?.coverImage?.large), bannerUrl: asText(row?.bannerImage) ?? asText(row?.coverImage?.extraLarge),
    synopsis: asText(row?.description), animeType: asText(row?.format), broadcastStatus: asText(row?.status), episodes: asNumber(row?.episodes), episodeDuration: asNumber(row?.duration),
    releaseYear: asNumber(row?.seasonYear) ?? asNumber(row?.startDate?.year), season: asText(row?.season)?.toLowerCase() ?? null,
    startDate: date(row?.startDate), endDate: date(row?.endDate), ageRating: null, sourceMaterial: asText(row?.source),
    publicScore: asNumber(row?.averageScore) === null ? null : (asNumber(row?.averageScore) ?? 0) / 10,
    genres: Array.isArray(row?.genres) ? row.genres.filter((item: unknown): item is string => typeof item === "string") : [],
    studios: Array.isArray(row?.studios?.nodes) ? row.studios.nodes.map((item: any) => asText(item?.name)).filter(Boolean) : [], relations: [],
  };
}

async function request<T>(query: string, variables: Record<string, unknown>, ttl: number): Promise<T> {
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
  const body = await response.json().catch(() => null) as any;
  const error = body?.errors?.map((item: any) => asText(item?.message)).filter(Boolean).join("; ");
  if (!response.ok || error) {
    console.error("[anilist-catalogue] request failed", { status: response.status, error: error ?? "unknown", duration: "within 7s" });
    throw new Error(response.status === 429 ? "動漫資料查詢太頻繁，請稍後再試。" : "動漫資料目前無法載入，請稍後再試。");
  }
  cache.set(key, { until: Date.now() + ttl, value: body.data });
  return body.data as T;
}

export async function getCatalogue(filters: CatalogueFilters = {}): Promise<CataloguePage> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const perPage = Math.min(30, Math.max(12, Math.floor(filters.perPage ?? 20)));
  const ttl = filters.season || (!filters.genre && !filters.tag && !filters.format && !filters.status) ? CATALOGUE_TTL : FILTER_TTL;
  const data = await request<any>(catalogueQuery, { page, perPage, season: filters.season ?? null, seasonYear: filters.seasonYear ?? null, genre: filters.genre ?? null, tag: filters.tag ?? null, format: filters.format ?? null, status: filters.status ?? null, sort: [filters.sort ?? "POPULARITY_DESC"] }, ttl);
  const info = data?.Page?.pageInfo;
  return { items: Array.isArray(data?.Page?.media) ? data.Page.media.map(mapAnime).filter((item: ExternalAnime) => item.id) : [], page: Number(info?.currentPage ?? page), hasNextPage: Boolean(info?.hasNextPage), total: Number(info?.total ?? 0) };
}

export async function getCatalogueTaxonomy(): Promise<CatalogueTaxonomy> {
  const data = await request<any>(taxonomyQuery, {}, TAXONOMY_TTL);
  const genres = Array.isArray(data?.GenreCollection) ? data.GenreCollection.filter((item: unknown): item is string => typeof item === "string").sort() : [];
  const tags = Array.isArray(data?.MediaTagCollection) ? data.MediaTagCollection.filter((item: any) => typeof item?.name === "string" && !item.isMediaSpoiler && Number(item.rank ?? 0) >= 55).sort((a: any, b: any) => Number(b.rank ?? 0) - Number(a.rank ?? 0)).map((item: any) => item.name).slice(0, 120) : [];
  return { genres, tags };
}

export function currentSeason(today = new Date()) {
  const month = today.getUTCMonth() + 1;
  const season = month <= 3 ? "WINTER" : month <= 6 ? "SPRING" : month <= 9 ? "SUMMER" : "FALL";
  return { season: season as NonNullable<CatalogueFilters["season"]>, year: today.getUTCFullYear() };
}
export function nextSeason(today = new Date()) {
  const current = currentSeason(today);
  const order: CatalogueFilters["season"][] = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const index = order.indexOf(current.season);
  return { season: order[(index + 1) % order.length]!, year: current.year + (current.season === "FALL" ? 1 : 0) };
}
