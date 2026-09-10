import "server-only";
import type { CatalogueFilters, CataloguePage } from "@/lib/anime/anilist-catalogue";
import type { ExternalAnime } from "@/lib/anime/types";
import { localizeAnimeTitles } from "@/lib/anime/bangumi-title-localizer";
import { enrichAdultCatalogue } from "@/lib/anime/adult-catalogue-enrichment";

const SHIKIMORI_ROOT = (process.env.ANIME_SHIKIMORI_API_URL || "https://shikimori.one/api").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 8_000;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

type ShikimoriRow = {
  id?: unknown; name?: unknown; japanese?: unknown; english?: unknown; kind?: unknown; status?: unknown; episodes?: unknown; score?: unknown; rating?: unknown;
  airedOn?: { date?: unknown }; releasedOn?: { date?: unknown }; poster?: { originalUrl?: unknown; mainUrl?: unknown };
  genres?: Array<{ name?: unknown }>;
};

function mapShikimori(row: ShikimoriRow, isAdult: boolean): ExternalAnime {
  const startDate = text(row?.airedOn?.date)?.slice(0, 10) ?? null;
  const japanese = text(row?.japanese);
  const english = text(row?.english);
  return {
    id: String(row?.id ?? ""), source: "jikan", title: japanese ?? english ?? text(row?.name) ?? "未命名動漫",
    titleJapanese: japanese, titleEnglish: english ?? text(row?.name), titleChinese: null, originalTitle: text(row?.name),
    coverUrl: text(row?.poster?.originalUrl) ?? text(row?.poster?.mainUrl), bannerUrl: text(row?.poster?.originalUrl), synopsis: null,
    animeType: text(row?.kind)?.toLocaleUpperCase() ?? null,
    broadcastStatus: ({ ongoing: "RELEASING", released: "FINISHED", anons: "NOT_YET_RELEASED" } as Record<string, string>)[String(row?.status ?? "")] ?? text(row?.status),
    episodes: number(row?.episodes), episodeDuration: null, releaseYear: startDate ? Number(startDate.slice(0, 4)) || null : null, season: null,
    startDate, endDate: text(row?.releasedOn?.date)?.slice(0, 10) ?? null, ageRating: text(row?.rating) ?? (isAdult ? "Rx" : null),
    sourceMaterial: null, publicScore: number(row?.score),
    genres: Array.isArray(row?.genres) ? row.genres.map((genre) => text(genre?.name)).filter((genre: string | null): genre is string => Boolean(genre)) : [],
    studios: [], relations: [], isAdult, contentRating: isAdult ? "成人內容（18+）" : null, externalUrl: `https://shikimori.one/animes/${row?.id}`,
  };
}

function argument(name: string, value: string | number | boolean | undefined) {
  if (value === undefined || value === "") return null;
  return `${name}: ${typeof value === "string" ? JSON.stringify(value) : String(value)}`;
}

function buildQuery(filters: CatalogueFilters, page: number, perPage: number) {
  const order = filters.sort === "SCORE_DESC" ? "ranked" : filters.sort === "START_DATE_DESC" || filters.sort === "NEXT_AIRING_EPISODE_DESC" ? "aired_on" : filters.sort === "TITLE_ROMAJI" ? "name" : "popularity";
  const season = filters.seasonYear
    ? filters.season ? `${({ WINTER: "winter", SPRING: "spring", SUMMER: "summer", FALL: "fall" } as const)[filters.season]}_${filters.seasonYear}` : String(filters.seasonYear)
    : undefined;
  const args = [
    argument("page", page), argument("limit", perPage), `order: ${order}`,
    argument("rating", filters.includeAdult ? "rx" : undefined), argument("censored", !filters.includeAdult),
    argument("search", filters.search), argument("kind", filters.format?.toLocaleLowerCase()),
    argument("status", filters.status ? ({ RELEASING: "ongoing", FINISHED: "released", NOT_YET_RELEASED: "anons" } as const)[filters.status] : undefined),
    argument("season", season),
  ].filter(Boolean).join(", ");
  return `query AnimeCatalogue { animes(${args}) { id name japanese english kind status episodes score rating airedOn { date } releasedOn { date } poster { originalUrl mainUrl } genres { name } } }`;
}

export async function getShikimoriCatalogue(filters: CatalogueFilters = {}): Promise<CataloguePage> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const perPage = Math.min(50, Math.max(1, Math.floor(filters.perPage ?? 20)));
  const response = await fetch(`${SHIKIMORI_ROOT}/graphql`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Personal-Vault/1.0 (catalogue fallback)" },
    body: JSON.stringify({ query: buildQuery(filters, page, perPage) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { data?: { animes?: ShikimoriRow[] }; errors?: Array<{ message?: unknown }> } | null;
  if (!response.ok || payload?.errors?.length) throw new Error(`Shikimori catalogue returned ${response.status}`);
  const rows = Array.isArray(payload?.data?.animes) ? payload.data.animes : [];
  let items = rows.map((row) => mapShikimori(row, Boolean(filters.includeAdult))).filter((anime) => anime.id);
  if (filters.genre) items = items.filter((anime) => anime.genres.some((genre) => genre.toLocaleLowerCase().includes(filters.genre!.toLocaleLowerCase())));
  if (filters.tag) items = items.filter((anime) => anime.genres.some((genre) => genre.toLocaleLowerCase().includes(filters.tag!.toLocaleLowerCase())));
  const localized = filters.includeAdult ? await enrichAdultCatalogue(items) : await localizeAnimeTitles(items);
  return { items: localized, page, hasNextPage: rows.length === perPage, total: page * perPage + (rows.length === perPage ? 1 : 0) };
}
