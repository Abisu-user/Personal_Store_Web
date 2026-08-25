import "server-only";
import type { AnimeRelation, ExternalAnime } from "@/lib/anime/types";

const API_ROOT = "https://api.jikan.moe/v4";
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const date = (value: unknown) => text(value)?.slice(0, 10) ?? null;
const values = (rows: unknown) => Array.isArray(rows) ? rows.map((row: any) => text(row?.name)).filter((value): value is string => Boolean(value)) : [];

function mapAnime(row: any): ExternalAnime {
  const titles = Array.isArray(row?.titles) ? row.titles : [];
  const titleFor = (type: string) => text(titles.find((title: any) => title?.type === type)?.title);
  const relations: AnimeRelation[] = Array.isArray(row?.relations) ? row.relations.flatMap((relation: any) => Array.isArray(relation?.entry) ? relation.entry.map((entry: any) => ({ relation: text(relation?.relation) ?? "關聯作品", malId: number(entry?.mal_id) ?? 0, title: text(entry?.name) ?? "未命名作品", type: text(entry?.type) })) : []) .filter((relation: AnimeRelation) => relation.malId > 0) : [];
  return {
    id: String(row?.mal_id ?? ""), title: text(row?.title) ?? titleFor("Default") ?? "未命名動漫", titleJapanese: titleFor("Japanese"), titleEnglish: titleFor("English"), titleChinese: null,
    originalTitle: text(row?.title), coverUrl: text(row?.images?.webp?.large_image_url) ?? text(row?.images?.jpg?.large_image_url) ?? text(row?.images?.webp?.image_url), bannerUrl: text(row?.trailer?.images?.maximum_image_url) ?? text(row?.images?.webp?.large_image_url), synopsis: text(row?.synopsis), animeType: text(row?.type), broadcastStatus: text(row?.status), episodes: number(row?.episodes), episodeDuration: number(row?.duration?.match?.(/(\d+)/)?.[1] ? Number(row.duration.match(/(\d+)/)?.[1]) : null), releaseYear: number(row?.year) ?? number(row?.aired?.prop?.from?.year), season: text(row?.season), startDate: date(row?.aired?.from), endDate: date(row?.aired?.to), ageRating: text(row?.rating), sourceMaterial: text(row?.source), publicScore: number(row?.score), genres: [...values(row?.genres), ...values(row?.explicit_genres), ...values(row?.themes), ...values(row?.demographics)], studios: values(row?.studios), relations,
  };
}

async function request(path: string) {
  const response = await fetch(`${API_ROOT}${path}`, { headers: { Accept: "application/json" }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`Jikan returned ${response.status}`);
  return response.json() as Promise<{ data?: unknown }>;
}

export async function searchAnime(query: string): Promise<ExternalAnime[]> {
  const result = await request(`/anime?${new URLSearchParams({ q: query, limit: "12", sfw: "true", order_by: "score", sort: "desc" })}`);
  return Array.isArray(result.data) ? result.data.map(mapAnime).filter((anime) => anime.id) : [];
}

export async function getAnimeDetail(externalId: string): Promise<ExternalAnime> {
  if (!/^\d{1,12}$/.test(externalId)) throw new Error("Invalid external anime id");
  const result = await request(`/anime/${externalId}/full`);
  if (!result.data || typeof result.data !== "object") throw new Error("Anime was not found");
  return mapAnime(result.data);
}
