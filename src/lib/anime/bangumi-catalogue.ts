import "server-only";
import type { CatalogueFilters, CataloguePage } from "@/lib/anime/anilist-catalogue";
import type { ExternalAnime } from "@/lib/anime/types";
import OpenCC from "opencc-js";

const BANGUMI_ROOT = (process.env.ANIME_BANGUMI_API_URL || "https://api.bgm.tv/v0").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 8_000;
const toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const image = (value: unknown) => { const result = text(value); return result?.startsWith("//") ? `https:${result}` : result; };
type BangumiRow = {
  id?: unknown; date?: unknown; name?: unknown; name_cn?: unknown; summary?: unknown; platform?: unknown; eps?: unknown; total_episodes?: unknown; nsfw?: unknown;
  images?: { large?: unknown; common?: unknown; medium?: unknown };
  rating?: { score?: unknown }; score?: unknown; tags?: Array<{ name?: unknown }>;
};

function mapBangumi(row: BangumiRow): ExternalAnime {
  const startDate = text(row?.date)?.slice(0, 10) ?? null;
  const chinese = text(row?.name_cn);
  return {
    id: String(row?.id ?? ""), source: "bangumi", title: chinese ? toTraditional(chinese) : text(row?.name) ?? "未命名動漫",
    titleJapanese: text(row?.name), titleEnglish: null, titleChinese: chinese ? toTraditional(chinese) : null, originalTitle: text(row?.name),
    coverUrl: image(row?.images?.large) ?? image(row?.images?.common) ?? image(row?.images?.medium), bannerUrl: image(row?.images?.large) ?? image(row?.images?.common),
    synopsis: text(row?.summary), animeType: text(row?.platform), broadcastStatus: null, episodes: number(row?.eps) ?? number(row?.total_episodes), episodeDuration: null,
    releaseYear: startDate && /^\d{4}/.test(startDate) ? Number(startDate.slice(0, 4)) : null, season: null, startDate, endDate: null,
    ageRating: null, sourceMaterial: null, publicScore: number(row?.rating?.score) ?? number(row?.score),
    genres: Array.isArray(row?.tags) ? row.tags.map((tag) => text(tag?.name)).filter((tag: string | null): tag is string => Boolean(tag)).slice(0, 12) : [],
    studios: [], relations: [], isAdult: Boolean(row?.nsfw), contentRating: row?.nsfw ? "成人內容" : null, externalUrl: `https://bgm.tv/subject/${row?.id}`,
  };
}

export async function getBangumiCatalogue(filters: CatalogueFilters = {}): Promise<CataloguePage> {
  if (filters.includeAdult) throw new Error("Bangumi public catalogue does not expose adult browsing");
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const perPage = Math.min(50, Math.max(1, Math.floor(filters.perPage ?? 20)));
  const params = new URLSearchParams({ type: "2", sort: filters.sort === "START_DATE_DESC" || filters.sort === "NEXT_AIRING_EPISODE_DESC" ? "date" : "rank", limit: String(perPage), offset: String((page - 1) * perPage) });
  if (filters.seasonYear) params.set("year", String(filters.seasonYear));
  if (filters.season) params.set("month", String(({ WINTER: 1, SPRING: 4, SUMMER: 7, FALL: 10 } as const)[filters.season]));
  const response = await fetch(`${BANGUMI_ROOT}/subjects?${params}`, { headers: { Accept: "application/json", "User-Agent": "Personal-Vault/1.0 (catalogue fallback)" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" });
  if (!response.ok) throw new Error(`Bangumi catalogue returned ${response.status}`);
  const payload = await response.json().catch(() => null) as { data?: BangumiRow[]; total?: number } | null;
  let items = Array.isArray(payload?.data) ? payload.data.map(mapBangumi).filter((anime) => anime.id && !anime.isAdult) : [];
  if (filters.genre) items = items.filter((anime) => anime.genres.some((genre) => genre.toLocaleLowerCase().includes(filters.genre!.toLocaleLowerCase())));
  if (filters.tag) items = items.filter((anime) => anime.genres.some((genre) => genre.toLocaleLowerCase().includes(filters.tag!.toLocaleLowerCase())));
  const total = Math.max(0, Number(payload?.total ?? 0));
  return { items, page, hasNextPage: page * perPage < total, total };
}
