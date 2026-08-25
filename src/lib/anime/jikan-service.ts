import "server-only";
import type { AnimeRelation, ExternalAnime } from "@/lib/anime/types";

const API_ROOT = "https://api.jikan.moe/v4";
const ANILIST_URL = "https://graphql.anilist.co";
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const date = (value: unknown) => text(value)?.slice(0, 10) ?? null;
const values = (rows: unknown) => Array.isArray(rows) ? rows.map((row: any) => text(row?.name)).filter((value): value is string => Boolean(value)) : [];

function mapAnime(row: any): ExternalAnime {
  const titles = Array.isArray(row?.titles) ? row.titles : [];
  const titleFor = (type: string) => text(titles.find((title: any) => title?.type === type)?.title);
  const relations: AnimeRelation[] = Array.isArray(row?.relations) ? row.relations.flatMap((relation: any) => Array.isArray(relation?.entry) ? relation.entry.map((entry: any) => ({ relation: text(relation?.relation) ?? "關聯作品", malId: number(entry?.mal_id) ?? 0, title: text(entry?.name) ?? "未命名作品", type: text(entry?.type) })) : []) .filter((relation: AnimeRelation) => relation.malId > 0) : [];
  return {
    id: String(row?.mal_id ?? ""), source: "jikan", title: text(row?.title) ?? titleFor("Default") ?? "未命名動漫", titleJapanese: titleFor("Japanese"), titleEnglish: titleFor("English"), titleChinese: null,
    originalTitle: text(row?.title), coverUrl: text(row?.images?.webp?.large_image_url) ?? text(row?.images?.jpg?.large_image_url) ?? text(row?.images?.webp?.image_url), bannerUrl: text(row?.trailer?.images?.maximum_image_url) ?? text(row?.images?.webp?.large_image_url), synopsis: text(row?.synopsis), animeType: text(row?.type), broadcastStatus: text(row?.status), episodes: number(row?.episodes), episodeDuration: number(row?.duration?.match?.(/(\d+)/)?.[1] ? Number(row.duration.match(/(\d+)/)?.[1]) : null), releaseYear: number(row?.year) ?? number(row?.aired?.prop?.from?.year), season: text(row?.season), startDate: date(row?.aired?.from), endDate: date(row?.aired?.to), ageRating: text(row?.rating), sourceMaterial: text(row?.source), publicScore: number(row?.score), genres: [...values(row?.genres), ...values(row?.explicit_genres), ...values(row?.themes), ...values(row?.demographics)], studios: values(row?.studios), relations,
  };
}

const anilistQuery = `query AnimeLibrary($search: String, $id: Int) { Page(page: 1, perPage: 12) { media(search: $search, id: $id, type: ANIME, isAdult: false, sort: [POPULARITY_DESC]) { id title { romaji english native } coverImage { extraLarge large } bannerImage description(asHtml: false) format status episodes duration season seasonYear startDate { year month day } endDate { year month day } averageScore genres studios { nodes { name } } source relations { edges { relationType(node: true) node { id type title { romaji english native } } } } } } }`;
const anilistDate = (value: any) => value?.year ? `${value.year}-${String(value.month ?? 1).padStart(2, "0")}-${String(value.day ?? 1).padStart(2, "0")}` : null;
function mapAniList(row: any): ExternalAnime {
  const relationLabels: Record<string, string> = { PREQUEL: "前作", SEQUEL: "續作", SIDE_STORY: "外傳", PARENT: "主線", CHARACTER: "角色", SUMMARY: "總集篇", ALTERNATIVE: "替代版本", SPIN_OFF: "衍生作品", OTHER: "其他關聯" };
  return { id: String(row?.id ?? ""), source: "anilist", title: text(row?.title?.romaji) ?? text(row?.title?.english) ?? text(row?.title?.native) ?? "未命名動漫", titleJapanese: text(row?.title?.native), titleEnglish: text(row?.title?.english), titleChinese: null, originalTitle: text(row?.title?.romaji), coverUrl: text(row?.coverImage?.extraLarge) ?? text(row?.coverImage?.large), bannerUrl: text(row?.bannerImage) ?? text(row?.coverImage?.extraLarge), synopsis: text(row?.description), animeType: text(row?.format), broadcastStatus: text(row?.status), episodes: number(row?.episodes), episodeDuration: number(row?.duration), releaseYear: number(row?.seasonYear) ?? number(row?.startDate?.year), season: text(row?.season)?.toLowerCase() ?? null, startDate: anilistDate(row?.startDate), endDate: anilistDate(row?.endDate), ageRating: null, sourceMaterial: text(row?.source), publicScore: number(row?.averageScore) === null ? null : (number(row?.averageScore) ?? 0) / 10, genres: values(row?.genres), studios: values(row?.studios?.nodes), relations: Array.isArray(row?.relations?.edges) ? row.relations.edges.map((edge: any) => ({ relation: relationLabels[text(edge?.relationType) ?? ""] ?? "關聯作品", malId: number(edge?.node?.id) ?? 0, title: text(edge?.node?.title?.romaji) ?? text(edge?.node?.title?.english) ?? text(edge?.node?.title?.native) ?? "未命名作品", type: text(edge?.node?.type) })).filter((relation: AnimeRelation) => relation.malId > 0) : [] };
}

async function anilist(variables: { search?: string; id?: number }) {
  const response = await fetch(ANILIST_URL, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ query: anilistQuery, variables }), cache: "no-store", signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`AniList returned ${response.status}`);
  const payload = await response.json() as { data?: { Page?: { media?: unknown[] } } };
  return Array.isArray(payload.data?.Page?.media) ? payload.data.Page.media.map(mapAniList).filter((anime) => anime.id) : [];
}

async function request(path: string) {
  const response = await fetch(`${API_ROOT}${path}`, { headers: { Accept: "application/json" }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`Jikan returned ${response.status}`);
  return response.json() as Promise<{ data?: unknown }>;
}

export async function searchAnime(query: string): Promise<ExternalAnime[]> {
  try { const result = await request(`/anime?${new URLSearchParams({ q: query, limit: "12", sfw: "true", order_by: "score", sort: "desc" })}`); return Array.isArray(result.data) ? result.data.map(mapAnime).filter((anime) => anime.id) : []; }
  catch { return anilist({ search: query }); }
}

export async function getAnimeDetail(source: "jikan" | "anilist", externalId: string): Promise<ExternalAnime> {
  if (!/^\d{1,12}$/.test(externalId)) throw new Error("Invalid external anime id");
  if (source === "anilist") { const [anime] = await anilist({ id: Number(externalId) }); if (!anime) throw new Error("Anime was not found"); return anime; }
  const result = await request(`/anime/${externalId}/full`);
  if (!result.data || typeof result.data !== "object") throw new Error("Anime was not found");
  return mapAnime(result.data);
}
