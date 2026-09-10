import "server-only";
import type { CatalogueFilters, CataloguePage, CatalogueTaxonomy } from "@/lib/anime/anilist-catalogue";
import type { ExternalAnime } from "@/lib/anime/types";
import { localizeAnimeTitles } from "@/lib/anime/bangumi-title-localizer";

const KITSU_ROOT = (process.env.ANIME_KITSU_API_URL || "https://kitsu.io/api/edge").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 9_000;
const GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

function categorySlug(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildKitsuCatalogueUrl(filters: CatalogueFilters, page: number, perPage: number) {
  const params = new URLSearchParams({ "page[limit]": String(perPage), "page[offset]": String((page - 1) * perPage) });
  const sort = ({ POPULARITY_DESC: "-userCount", SCORE_DESC: "-averageRating", START_DATE_DESC: "-startDate", NEXT_AIRING_EPISODE_DESC: "-startDate", TITLE_ROMAJI: "canonicalTitle", FAVOURITES_DESC: "-favoritesCount" } as const)[filters.sort ?? "POPULARITY_DESC"];
  params.set("sort", sort);
  params.set("include", "mappings");
  if (filters.search) params.set("filter[text]", filters.search);
  if (filters.season) params.set("filter[season]", filters.season.toLocaleLowerCase());
  if (filters.seasonYear) params.set("filter[seasonYear]", String(filters.seasonYear));
  if (filters.genre) params.set("filter[categories]", categorySlug(filters.genre));
  if (filters.format) params.set("filter[subtype]", filters.format.toLocaleLowerCase());
  if (filters.status) params.set("filter[status]", ({ RELEASING: "current", FINISHED: "finished", NOT_YET_RELEASED: "upcoming" } as const)[filters.status]);
  return `${KITSU_ROOT}/anime?${params}`;
}

function mappingIds(payload: any) {
  const result = new Map<string, string>();
  for (const row of Array.isArray(payload?.included) ? payload.included : []) {
    if (row?.type === "mappings" && row?.attributes?.externalSite === "myanimelist/anime" && text(row?.attributes?.externalId)) result.set(String(row.id), String(row.attributes.externalId));
  }
  return result;
}

function mapKitsu(row: any, mappings: Map<string, string>): ExternalAnime | null {
  const attributes = row?.attributes ?? {};
  const mappingRefs = Array.isArray(row?.relationships?.mappings?.data) ? row.relationships.mappings.data : [];
  const externalId = mappingRefs.map((entry: any) => mappings.get(String(entry?.id))).find(Boolean);
  if (!externalId) return null;
  const titles = attributes?.titles ?? {};
  const score = number(attributes?.averageRating);
  const status = ({ current: "RELEASING", finished: "FINISHED", upcoming: "NOT_YET_RELEASED", tba: "NOT_YET_RELEASED", unreleased: "NOT_YET_RELEASED" } as Record<string, string>)[String(attributes?.status ?? "")] ?? text(attributes?.status);
  return {
    id: externalId, source: "jikan", title: text(attributes?.canonicalTitle) ?? text(titles?.en_jp) ?? text(titles?.en) ?? text(titles?.ja_jp) ?? "未命名動漫",
    titleJapanese: text(titles?.ja_jp), titleEnglish: text(titles?.en) ?? text(titles?.en_us), titleChinese: null, originalTitle: text(titles?.en_jp) ?? text(attributes?.canonicalTitle),
    coverUrl: text(attributes?.posterImage?.large) ?? text(attributes?.posterImage?.original) ?? text(attributes?.posterImage?.medium),
    bannerUrl: text(attributes?.coverImage?.large) ?? text(attributes?.coverImage?.original) ?? text(attributes?.posterImage?.large),
    synopsis: text(attributes?.synopsis) ?? text(attributes?.description), animeType: text(attributes?.subtype)?.toLocaleUpperCase() ?? null,
    broadcastStatus: status, episodes: number(attributes?.episodeCount), episodeDuration: number(attributes?.episodeLength),
    releaseYear: text(attributes?.startDate) ? Number(String(attributes.startDate).slice(0, 4)) || null : null, season: null,
    startDate: text(attributes?.startDate)?.slice(0, 10) ?? null, endDate: text(attributes?.endDate)?.slice(0, 10) ?? null,
    ageRating: text(attributes?.ageRating), sourceMaterial: null, publicScore: score === null ? null : score / 10,
    genres: [], studios: [], relations: [], isAdult: Boolean(attributes?.nsfw), contentRating: text(attributes?.ageRatingGuide) ?? text(attributes?.ageRating),
    externalUrl: `https://kitsu.io/anime/${text(attributes?.slug) ?? row.id}`,
  };
}

export async function getKitsuCatalogue(filters: CatalogueFilters = {}): Promise<CataloguePage> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  // Kitsu rejects page sizes above 20. The catalogue UI normally requests 24.
  const perPage = Math.min(20, Math.max(1, Math.floor(filters.perPage ?? 20)));
  const response = await fetch(buildKitsuCatalogueUrl(filters, page, perPage), { headers: { Accept: "application/vnd.api+json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" });
  if (!response.ok) throw new Error(`Kitsu catalogue returned ${response.status}`);
  const payload = await response.json().catch(() => null) as any;
  const mappings = mappingIds(payload);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const items = rows.map((row: unknown) => mapKitsu(row, mappings)).filter((anime: ExternalAnime | null): anime is ExternalAnime => Boolean(anime) && (filters.includeAdult || !anime!.isAdult));
  const total = Math.max(0, Number(payload?.meta?.count ?? 0));
  return { items: await localizeAnimeTitles(items), page, hasNextPage: page * perPage < total, total };
}

export function getKitsuTaxonomy(): CatalogueTaxonomy {
  return { genres: [...GENRES], tags: [] };
}
