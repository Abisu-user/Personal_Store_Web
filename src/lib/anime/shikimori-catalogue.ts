import "server-only";
import type { CatalogueFilters, CataloguePage } from "@/lib/anime/anilist-catalogue";
import type { ExternalAnime } from "@/lib/anime/types";

const SHIKIMORI_ROOT = (process.env.ANIME_SHIKIMORI_API_URL || "https://shikimori.one/api").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 8_000;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const absolute = (value: unknown) => { const path = text(value); return path ? new URL(path, "https://shikimori.one").toString() : null; };
type ShikimoriRow = {
  id?: unknown; name?: unknown; kind?: unknown; status?: unknown; episodes?: unknown; score?: unknown; aired_on?: unknown; released_on?: unknown; url?: unknown;
  image?: { original?: unknown; preview?: unknown };
};

function mapShikimori(row: ShikimoriRow, isAdult: boolean): ExternalAnime {
  const startDate = text(row?.aired_on)?.slice(0, 10) ?? null;
  return {
    id: String(row?.id ?? ""), source: "jikan", title: text(row?.name) ?? "未命名動漫", titleJapanese: null, titleEnglish: text(row?.name), titleChinese: null, originalTitle: text(row?.name),
    coverUrl: absolute(row?.image?.original) ?? absolute(row?.image?.preview), bannerUrl: absolute(row?.image?.original), synopsis: null,
    animeType: text(row?.kind)?.toLocaleUpperCase() ?? null, broadcastStatus: ({ ongoing: "RELEASING", released: "FINISHED", anons: "NOT_YET_RELEASED" } as Record<string, string>)[String(row?.status ?? "")] ?? text(row?.status),
    episodes: number(row?.episodes), episodeDuration: null, releaseYear: startDate ? Number(startDate.slice(0, 4)) || null : null, season: null, startDate, endDate: text(row?.released_on)?.slice(0, 10) ?? null,
    ageRating: isAdult ? "R+ / Rx" : null, sourceMaterial: null, publicScore: number(row?.score), genres: [], studios: [], relations: [], isAdult, contentRating: isAdult ? "成人內容" : null,
    externalUrl: absolute(row?.url),
  };
}

export async function getShikimoriCatalogue(filters: CatalogueFilters = {}): Promise<CataloguePage> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const perPage = Math.min(50, Math.max(1, Math.floor(filters.perPage ?? 20)));
  const params = new URLSearchParams({ page: String(page), limit: String(perPage), order: filters.sort === "SCORE_DESC" ? "ranked" : filters.sort === "START_DATE_DESC" || filters.sort === "NEXT_AIRING_EPISODE_DESC" ? "aired_on" : "popularity" });
  if (filters.includeAdult) params.set("rating", "r_plus,rx"); else params.set("censored", "true");
  if (filters.search) params.set("search", filters.search);
  if (filters.format) params.set("kind", filters.format.toLocaleLowerCase());
  if (filters.status) params.set("status", ({ RELEASING: "ongoing", FINISHED: "released", NOT_YET_RELEASED: "anons" } as const)[filters.status]);
  if (filters.seasonYear) params.set("season", filters.season ? `${({ WINTER: "winter", SPRING: "spring", SUMMER: "summer", FALL: "fall" } as const)[filters.season]}_${filters.seasonYear}` : String(filters.seasonYear));
  const response = await fetch(`${SHIKIMORI_ROOT}/animes?${params}`, { headers: { Accept: "application/json", "User-Agent": "Personal-Vault/1.0 (catalogue fallback)" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" });
  if (!response.ok) throw new Error(`Shikimori catalogue returned ${response.status}`);
  const payload = await response.json().catch(() => null);
  const rows = Array.isArray(payload) ? payload as ShikimoriRow[] : [];
  const items = rows.map((row) => mapShikimori(row, Boolean(filters.includeAdult))).filter((anime) => anime.id);
  // Avoid one title-localization request per card here. The fallback must stay
  // fast and usable while the primary catalogue is down.
  return { items, page, hasNextPage: rows.length === perPage, total: page * perPage + (rows.length === perPage ? 1 : 0) };
}
