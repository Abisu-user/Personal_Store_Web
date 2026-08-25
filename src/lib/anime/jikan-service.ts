import "server-only";
import type { AnimeRelation, ExternalAnime } from "@/lib/anime/types";

const API_ROOT = (process.env.ANIME_JIKAN_API_URL || "https://api.jikan.moe/v4").replace(/\/+$/, "");
const ANILIST_URL = process.env.ANIME_ANILIST_API_URL || "https://graphql.anilist.co";
const SEARCH_TIMEOUT_MS = 6_500;
const SEARCH_CACHE_TTL_MS = 20 * 60 * 1_000;
const SEARCH_CACHE_LIMIT = 100;

type Provider = "anilist" | "jikan";
export type AnimeSearchErrorCode = "rate_limited" | "timeout" | "maintenance" | "network" | "unknown";
type SearchCacheEntry = { expiresAt: number; results: ExternalAnime[] };

const searchCache = new Map<string, SearchCacheEntry>();
const providerCooldowns = new Map<Provider, number>();
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const date = (value: unknown) => text(value)?.slice(0, 10) ?? null;
const values = (rows: unknown) => Array.isArray(rows) ? rows.map((row: any) => text(row?.name)).filter((value): value is string => Boolean(value)) : [];

export class AnimeSearchError extends Error {
  constructor(
    public readonly code: AnimeSearchErrorCode,
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly provider?: Provider,
    public readonly responseSnippet?: string,
  ) { super(message); this.name = "AnimeSearchError"; }
}

class AnimeProviderError extends Error {
  constructor(
    public readonly provider: Provider,
    public readonly status: number,
    public readonly code: AnimeSearchErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly responseSnippet?: string,
  ) { super(message); this.name = "AnimeProviderError"; }
}

function mapAnime(row: any): ExternalAnime {
  const titles = Array.isArray(row?.titles) ? row.titles : [];
  const titleFor = (type: string) => text(titles.find((title: any) => title?.type === type)?.title);
  const relations: AnimeRelation[] = Array.isArray(row?.relations) ? row.relations.flatMap((relation: any) => Array.isArray(relation?.entry) ? relation.entry.map((entry: any) => ({ relation: text(relation?.relation) ?? "關聯作品", malId: number(entry?.mal_id) ?? 0, title: text(entry?.name) ?? "未命名作品", type: text(entry?.type) })) : []).filter((relation: AnimeRelation) => relation.malId > 0) : [];
  return {
    id: String(row?.mal_id ?? ""), source: "jikan", title: text(row?.title) ?? titleFor("Default") ?? "未命名動漫", titleJapanese: titleFor("Japanese"), titleEnglish: titleFor("English"), titleChinese: null,
    originalTitle: text(row?.title), coverUrl: text(row?.images?.webp?.large_image_url) ?? text(row?.images?.jpg?.large_image_url) ?? text(row?.images?.webp?.image_url), bannerUrl: text(row?.trailer?.images?.maximum_image_url) ?? text(row?.images?.webp?.large_image_url), synopsis: text(row?.synopsis), animeType: text(row?.type), broadcastStatus: text(row?.status), episodes: number(row?.episodes), episodeDuration: number(row?.duration?.match?.(/(\d+)/)?.[1] ? Number(row.duration.match(/(\d+)/)?.[1]) : null), releaseYear: number(row?.year) ?? number(row?.aired?.prop?.from?.year), season: text(row?.season), startDate: date(row?.aired?.from), endDate: date(row?.aired?.to), ageRating: text(row?.rating), sourceMaterial: text(row?.source), publicScore: number(row?.score), genres: [...values(row?.genres), ...values(row?.explicit_genres), ...values(row?.themes), ...values(row?.demographics)], studios: values(row?.studios), relations,
  };
}

const anilistQuery = `query AnimeLibrary($search: String, $id: Int) { Page(page: 1, perPage: 12) { media(search: $search, id: $id, type: ANIME, isAdult: false, sort: [POPULARITY_DESC]) { id title { romaji english native } coverImage { extraLarge large } bannerImage description(asHtml: false) format status episodes duration season seasonYear startDate { year month day } endDate { year month day } averageScore genres studios { nodes { name } } source relations { edges { relationType node { id type title { romaji english native } } } } } } }`;
const anilistDate = (value: any) => value?.year ? `${value.year}-${String(value.month ?? 1).padStart(2, "0")}-${String(value.day ?? 1).padStart(2, "0")}` : null;

function mapAniList(row: any): ExternalAnime {
  const relationLabels: Record<string, string> = { PREQUEL: "前作", SEQUEL: "續作", SIDE_STORY: "外傳", PARENT: "主線", CHARACTER: "角色", SUMMARY: "總集篇", ALTERNATIVE: "替代版本", SPIN_OFF: "衍生作品", OTHER: "其他關聯" };
  return { id: String(row?.id ?? ""), source: "anilist", title: text(row?.title?.romaji) ?? text(row?.title?.english) ?? text(row?.title?.native) ?? "未命名動漫", titleJapanese: text(row?.title?.native), titleEnglish: text(row?.title?.english), titleChinese: null, originalTitle: text(row?.title?.romaji), coverUrl: text(row?.coverImage?.extraLarge) ?? text(row?.coverImage?.large), bannerUrl: text(row?.bannerImage) ?? text(row?.coverImage?.extraLarge), synopsis: text(row?.description), animeType: text(row?.format), broadcastStatus: text(row?.status), episodes: number(row?.episodes), episodeDuration: number(row?.duration), releaseYear: number(row?.seasonYear) ?? number(row?.startDate?.year), season: text(row?.season)?.toLowerCase() ?? null, startDate: anilistDate(row?.startDate), endDate: anilistDate(row?.endDate), ageRating: null, sourceMaterial: text(row?.source), publicScore: number(row?.averageScore) === null ? null : (number(row?.averageScore) ?? 0) / 10, genres: values(row?.genres), studios: values(row?.studios?.nodes), relations: Array.isArray(row?.relations?.edges) ? row.relations.edges.map((edge: any) => ({ relation: relationLabels[text(edge?.relationType) ?? ""] ?? "關聯作品", malId: number(edge?.node?.id) ?? 0, title: text(edge?.node?.title?.romaji) ?? text(edge?.node?.title?.english) ?? text(edge?.node?.title?.native) ?? "未命名作品", type: text(edge?.node?.type) })).filter((relation: AnimeRelation) => relation.malId > 0) : [] };
}

type AniListPayload = { data?: { Page?: { media?: unknown[] } }; errors?: Array<{ message?: unknown }> };

function normalizeQuery(query: string) { return query.normalize("NFKC").trim().toLocaleLowerCase(); }
function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function responseSnippet(body: string) { return body.replace(/\s+/g, " ").slice(0, 500); }
function retryAfterSeconds(value: string | null) {
  if (!value) return 20;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(300, Math.max(1, Math.ceil(seconds)));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.min(300, Math.max(1, Math.ceil((at - Date.now()) / 1_000))) : 20;
}
function providerCode(status: number): AnimeSearchErrorCode {
  if (status === 429) return "rate_limited";
  if ([500, 502, 503, 504].includes(status)) return "maintenance";
  return "unknown";
}
function getCachedSearch(key: string) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { searchCache.delete(key); return null; }
  return entry.results;
}
function cacheSearch(key: string, results: ExternalAnime[]) {
  searchCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, results });
  while (searchCache.size > SEARCH_CACHE_LIMIT) searchCache.delete(searchCache.keys().next().value as string);
}

async function providerFetch(provider: Provider, url: string, init: RequestInit, callerSignal?: AbortSignal) {
  const cooldownUntil = providerCooldowns.get(provider) ?? 0;
  if (cooldownUntil > Date.now()) {
    throw new AnimeProviderError(provider, 429, "rate_limited", `${provider} is cooling down`, Math.ceil((cooldownUntil - Date.now()) / 1_000));
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
    try {
      const response = await fetch(url, { ...init, signal });
      if (response.ok) return response;
      const status = response.status;
      const retryAfter = status === 429 ? retryAfterSeconds(response.headers.get("retry-after")) : undefined;
      const failure = new AnimeProviderError(provider, status, providerCode(status), `${provider} returned ${status}`, retryAfter, responseSnippet(await response.text().catch(() => "")));
      if (status === 429) {
        providerCooldowns.set(provider, Date.now() + (retryAfter ?? 20) * 1_000);
        if (attempt === 0 && (retryAfter ?? 20) <= 1) { await wait(1_000); continue; }
        throw failure;
      }
      if (attempt === 0 && [500, 502, 503, 504].includes(status)) { await wait(350); continue; }
      throw failure;
    } catch (caught) {
      if (caught instanceof AnimeProviderError) throw caught;
      if (callerSignal?.aborted) throw caught;
      if (timeout.aborted || (caught instanceof Error && caught.name === "TimeoutError")) {
        throw new AnimeProviderError(provider, 504, "timeout", `${provider} timed out`);
      }
      throw new AnimeProviderError(provider, 503, "network", caught instanceof Error ? caught.message : `${provider} network request failed`);
    }
  }
  throw new AnimeProviderError(provider, 503, "unknown", `${provider} request failed`);
}

async function anilist(variables: { search?: string; id?: number }, callerSignal?: AbortSignal) {
  const response = await providerFetch("anilist", ANILIST_URL, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ query: anilistQuery, variables }), cache: "no-store" }, callerSignal);
  const payload = await response.json().catch(() => null) as AniListPayload | null;
  const graphQLError = payload?.errors?.map((entry) => text(entry?.message)).filter(Boolean).join("; ");
  if (graphQLError) throw new AnimeProviderError("anilist", 503, "maintenance", `AniList GraphQL: ${graphQLError}`, undefined, graphQLError);
  return Array.isArray(payload?.data?.Page?.media) ? payload.data.Page.media.map(mapAniList).filter((anime) => anime.id) : [];
}

async function jikanRequest(path: string, callerSignal?: AbortSignal) {
  const response = await providerFetch("jikan", `${API_ROOT}${path}`, { headers: { Accept: "application/json" }, next: { revalidate: 3600 } }, callerSignal);
  return response.json() as Promise<{ data?: unknown }>;
}

function toSearchError(failures: AnimeProviderError[]) {
  const rateLimited = failures.find((failure) => failure.code === "rate_limited");
  if (rateLimited) return new AnimeSearchError("rate_limited", 429, rateLimited.message, rateLimited.retryAfterSeconds, rateLimited.provider, rateLimited.responseSnippet);
  const timeout = failures.find((failure) => failure.code === "timeout");
  if (timeout) return new AnimeSearchError("timeout", 504, timeout.message, undefined, timeout.provider, timeout.responseSnippet);
  const maintenance = failures.find((failure) => failure.code === "maintenance");
  if (maintenance) return new AnimeSearchError("maintenance", 503, maintenance.message, undefined, maintenance.provider, maintenance.responseSnippet);
  const network = failures.find((failure) => failure.code === "network");
  // A provider-side network error is not proof that the user's device is
  // offline. The client handles genuine device offline state separately.
  if (network) return new AnimeSearchError("unknown", 503, network.message, undefined, network.provider, network.responseSnippet);
  const fallback = failures[0];
  return new AnimeSearchError("unknown", 503, fallback?.message ?? "Anime search failed", undefined, fallback?.provider, fallback?.responseSnippet);
}

export async function searchAnime(query: string, callerSignal?: AbortSignal): Promise<ExternalAnime[]> {
  const key = normalizeQuery(query);
  const cached = getCachedSearch(key);
  if (cached) return cached;

  const failures: AnimeProviderError[] = [];
  try {
    const results = await anilist({ search: query }, callerSignal);
    if (results.length > 0) { cacheSearch(key, results); return results; }
  } catch (caught) {
    if (callerSignal?.aborted) throw caught;
    if (caught instanceof AnimeProviderError) failures.push(caught);
    else failures.push(new AnimeProviderError("anilist", 503, "unknown", caught instanceof Error ? caught.message : "AniList search failed"));
  }

  try {
    const result = await jikanRequest(`/anime?${new URLSearchParams({ q: query, limit: "12", sfw: "true", order_by: "score", sort: "desc" })}`, callerSignal);
    const results = Array.isArray(result.data) ? result.data.map(mapAnime).filter((anime) => anime.id) : [];
    if (results.length > 0) { cacheSearch(key, results); return results; }
    // Do not turn a provider rate limit or outage into a false "no results".
    if (failures.length > 0) throw toSearchError(failures);
    cacheSearch(key, results);
    return results;
  } catch (caught) {
    if (callerSignal?.aborted) throw caught;
    if (caught instanceof AnimeProviderError) failures.push(caught);
    else failures.push(new AnimeProviderError("jikan", 503, "unknown", caught instanceof Error ? caught.message : "Jikan search failed"));
  }

  throw toSearchError(failures);
}

export async function getAnimeDetail(source: "jikan" | "anilist", externalId: string): Promise<ExternalAnime> {
  if (!/^\d{1,12}$/.test(externalId)) throw new Error("Invalid external anime id");
  if (source === "anilist") { const [anime] = await anilist({ id: Number(externalId) }); if (!anime) throw new Error("Anime was not found"); return anime; }
  const result = await jikanRequest(`/anime/${externalId}/full`);
  if (!result.data || typeof result.data !== "object") throw new Error("Anime was not found");
  return mapAnime(result.data);
}
