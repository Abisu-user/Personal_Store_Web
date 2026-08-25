import "server-only";
import type { AnimeRelation, ExternalAnime } from "@/lib/anime/types";
import { localizeAnimeTitles } from "@/lib/anime/bangumi-title-localizer";

const JIKAN_ROOT = (process.env.ANIME_JIKAN_API_URL || "https://api.jikan.moe/v4").replace(/\/+$/, "");
const ANILIST_URL = process.env.ANIME_ANILIST_API_URL || "https://graphql.anilist.co";
const BANGUMI_ROOT = (process.env.ANIME_BANGUMI_API_URL || "https://api.bgm.tv/v0").replace(/\/+$/, "");
const SEARCH_TIMEOUT_MS = 6_500;
const SEARCH_CACHE_TTL_MS = 20 * 60 * 1_000;
const SEARCH_CACHE_LIMIT = 100;

export type AnimeProvider = "anilist" | "bangumi" | "jikan";
export type AnimeSearchErrorCode = "rate_limited" | "forbidden" | "upstream_error" | "upstream_unavailable" | "timeout" | "network" | "unknown";
type SearchCacheEntry = { expiresAt: number; results: ExternalAnime[] };

const searchCache = new Map<string, SearchCacheEntry>();
const providerCooldowns = new Map<AnimeProvider, number>();
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const date = (value: unknown) => text(value)?.slice(0, 10) ?? null;
const values = (rows: unknown) => Array.isArray(rows) ? rows.map((row: any) => text(row?.name)).filter((value): value is string => Boolean(value)) : [];
const safeUrl = (value: string) => { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return value; } };
const snippet = (body: string) => body.replace(/\s+/g, " ").slice(0, 600);

export class AnimeSearchError extends Error {
  constructor(
    public readonly code: AnimeSearchErrorCode,
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly provider?: AnimeProvider,
    public readonly responseSnippet?: string,
  ) { super(message); this.name = "AnimeSearchError"; }
}

class AnimeProviderError extends Error {
  constructor(
    public readonly provider: AnimeProvider,
    public readonly status: number,
    public readonly code: AnimeSearchErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly responseSnippet?: string,
  ) { super(message); this.name = "AnimeProviderError"; }
}

function logUpstream(provider: AnimeProvider, url: string, details: Record<string, unknown>) {
  // Search terms are private, so logs retain the endpoint but not query parameters.
  console.info("[anime-upstream]", { provider, upstreamUrl: safeUrl(url), ...details });
}
function normalizeQuery(query: string) { return query.normalize("NFKC").trim().toLocaleLowerCase(); }
function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function retryAfterSeconds(value: string | null) {
  if (!value) return 20;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(300, Math.max(1, Math.ceil(seconds)));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.min(300, Math.max(1, Math.ceil((at - Date.now()) / 1_000))) : 20;
}
function providerCode(status: number): AnimeSearchErrorCode {
  if (status === 429) return "rate_limited";
  if (status === 403) return "forbidden";
  if (status === 500) return "upstream_error";
  if ([502, 503, 504].includes(status)) return "upstream_unavailable";
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

async function providerFetch(provider: AnimeProvider, url: string, init: RequestInit, callerSignal?: AbortSignal) {
  const cooldownUntil = providerCooldowns.get(provider) ?? 0;
  if (cooldownUntil > Date.now()) {
    const retryAfter = Math.ceil((cooldownUntil - Date.now()) / 1_000);
    logUpstream(provider, url, { httpStatus: 429, error: "provider cooldown", responseBody: null, timeout: false, rateLimit: true, durationMs: 0 });
    throw new AnimeProviderError(provider, 429, "rate_limited", `${provider} is cooling down`, retryAfter);
  }
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
    try {
      const response = await fetch(url, { ...init, signal, redirect: "follow" });
      const responseBody = snippet(await response.clone().text().catch(() => ""));
      logUpstream(provider, url, { httpStatus: response.status, error: null, responseBody, timeout: false, rateLimit: response.status === 429, durationMs: Date.now() - startedAt, attempt, redirected: response.redirected });
      if (response.ok) return response;
      const retryAfter = response.status === 429 ? retryAfterSeconds(response.headers.get("retry-after")) : undefined;
      const failure = new AnimeProviderError(provider, response.status, providerCode(response.status), `${provider} returned ${response.status}`, retryAfter, responseBody);
      if (response.status === 429) {
        providerCooldowns.set(provider, Date.now() + (retryAfter ?? 20) * 1_000);
        if (attempt === 1 && (retryAfter ?? 20) <= 1) { await wait(1_000); continue; }
        throw failure;
      }
      if (attempt === 1 && [500, 502, 503, 504].includes(response.status)) { await wait(350); continue; }
      throw failure;
    } catch (caught) {
      if (caught instanceof AnimeProviderError) throw caught;
      if (callerSignal?.aborted) throw caught;
      const timedOut = timeout.aborted || (caught instanceof Error && (caught.name === "TimeoutError" || caught.name === "AbortError"));
      logUpstream(provider, url, { httpStatus: null, error: caught instanceof Error ? caught.message : "unknown request error", responseBody: null, timeout: timedOut, rateLimit: false, durationMs: Date.now() - startedAt, attempt });
      throw new AnimeProviderError(provider, timedOut ? 504 : 502, timedOut ? "timeout" : "network", timedOut ? `${provider} timed out` : (caught instanceof Error ? caught.message : `${provider} network request failed`));
    }
  }
  throw new AnimeProviderError(provider, 502, "unknown", `${provider} request failed`);
}

function mapJikan(row: any): ExternalAnime {
  const titles = Array.isArray(row?.titles) ? row.titles : [];
  const titleFor = (type: string) => text(titles.find((title: any) => title?.type === type)?.title);
  const relations: AnimeRelation[] = Array.isArray(row?.relations) ? row.relations.flatMap((relation: any) => Array.isArray(relation?.entry) ? relation.entry.map((entry: any) => ({ relation: text(relation?.relation) ?? "關聯作品", malId: number(entry?.mal_id) ?? 0, title: text(entry?.name) ?? "未命名作品", type: text(entry?.type) })) : []).filter((relation: AnimeRelation) => relation.malId > 0) : [];
  const durationMatch = text(row?.duration)?.match(/(\d+)/);
  return { id: String(row?.mal_id ?? ""), source: "jikan", title: text(row?.title) ?? titleFor("Default") ?? "未命名動漫", titleJapanese: titleFor("Japanese"), titleEnglish: titleFor("English"), titleChinese: null, originalTitle: text(row?.title), coverUrl: text(row?.images?.webp?.large_image_url) ?? text(row?.images?.jpg?.large_image_url) ?? text(row?.images?.webp?.image_url), bannerUrl: text(row?.trailer?.images?.maximum_image_url) ?? text(row?.images?.webp?.large_image_url), synopsis: text(row?.synopsis), animeType: text(row?.type), broadcastStatus: text(row?.status), episodes: number(row?.episodes), episodeDuration: durationMatch ? Number(durationMatch[1]) : null, releaseYear: number(row?.year) ?? number(row?.aired?.prop?.from?.year), season: text(row?.season), startDate: date(row?.aired?.from), endDate: date(row?.aired?.to), ageRating: text(row?.rating), sourceMaterial: text(row?.source), publicScore: number(row?.score), genres: [...values(row?.genres), ...values(row?.explicit_genres), ...values(row?.themes), ...values(row?.demographics)], studios: values(row?.studios), relations, isAdult: Boolean(row?.explicit_genres?.length), contentRating: text(row?.rating), externalUrl: text(row?.url) };
}

const anilistQuery = `query AnimeLibrary($search: String, $id: Int) { Page(page: 1, perPage: 12) { media(search: $search, id: $id, type: ANIME, isAdult: false, sort: [POPULARITY_DESC]) { id title { romaji english native } coverImage { extraLarge large } bannerImage description(asHtml: false) format status episodes duration season seasonYear startDate { year month day } endDate { year month day } averageScore genres studios { nodes { name } } source isAdult siteUrl relations { edges { relationType node { id type title { romaji english native } } } } } } }`;
const anilistDate = (value: any) => value?.year ? `${value.year}-${String(value.month ?? 1).padStart(2, "0")}-${String(value.day ?? 1).padStart(2, "0")}` : null;
function mapAniList(row: any): ExternalAnime {
  const relationLabels: Record<string, string> = { PREQUEL: "前作", SEQUEL: "續作", SIDE_STORY: "外傳", PARENT: "主線", CHARACTER: "角色", SUMMARY: "總集篇", ALTERNATIVE: "替代版本", SPIN_OFF: "衍生作品", OTHER: "其他關聯" };
  return { id: String(row?.id ?? ""), source: "anilist", title: text(row?.title?.romaji) ?? text(row?.title?.english) ?? text(row?.title?.native) ?? "未命名動漫", titleJapanese: text(row?.title?.native), titleEnglish: text(row?.title?.english), titleChinese: null, originalTitle: text(row?.title?.romaji), coverUrl: text(row?.coverImage?.extraLarge) ?? text(row?.coverImage?.large), bannerUrl: text(row?.bannerImage) ?? text(row?.coverImage?.extraLarge), synopsis: text(row?.description), animeType: text(row?.format), broadcastStatus: text(row?.status), episodes: number(row?.episodes), episodeDuration: number(row?.duration), releaseYear: number(row?.seasonYear) ?? number(row?.startDate?.year), season: text(row?.season)?.toLowerCase() ?? null, startDate: anilistDate(row?.startDate), endDate: anilistDate(row?.endDate), ageRating: null, sourceMaterial: text(row?.source), publicScore: number(row?.averageScore) === null ? null : (number(row?.averageScore) ?? 0) / 10, genres: values(row?.genres), studios: values(row?.studios?.nodes), relations: Array.isArray(row?.relations?.edges) ? row.relations.edges.map((edge: any) => ({ relation: relationLabels[text(edge?.relationType) ?? ""] ?? "關聯作品", malId: number(edge?.node?.id) ?? 0, title: text(edge?.node?.title?.romaji) ?? text(edge?.node?.title?.english) ?? text(edge?.node?.title?.native) ?? "未命名作品", type: text(edge?.node?.type) })).filter((relation: AnimeRelation) => relation.malId > 0) : [], isAdult: Boolean(row?.isAdult), contentRating: row?.isAdult ? "成人內容" : null, externalUrl: text(row?.siteUrl) };
}

function normalImage(value: unknown) { const image = text(value); return image?.startsWith("//") ? `https:${image}` : image; }
function mapBangumi(row: any): ExternalAnime {
  const startDate = date(row?.date);
  return { id: String(row?.id ?? ""), source: "bangumi", title: text(row?.name_cn) ?? text(row?.name) ?? "未命名動漫", titleJapanese: text(row?.name), titleEnglish: null, titleChinese: text(row?.name_cn), originalTitle: text(row?.name), coverUrl: normalImage(row?.images?.large) ?? normalImage(row?.images?.common) ?? normalImage(row?.images?.medium) ?? normalImage(row?.images?.small), bannerUrl: normalImage(row?.images?.large) ?? normalImage(row?.images?.common), synopsis: text(row?.summary), animeType: text(row?.platform), broadcastStatus: null, episodes: number(row?.eps) ?? number(row?.total_episodes), episodeDuration: null, releaseYear: startDate && /^\d{4}/.test(startDate) ? Number(startDate.slice(0, 4)) : null, season: null, startDate, endDate: null, ageRating: null, sourceMaterial: null, publicScore: number(row?.rating?.score) ?? number(row?.score), genres: values(row?.tags).slice(0, 12), studios: [], relations: [], isAdult: false, contentRating: null, externalUrl: text(row?.url) };
}

type AniListPayload = { data?: { Page?: { media?: unknown[] } }; errors?: Array<{ message?: unknown }> };
async function anilist(variables: { search?: string; id?: number }, callerSignal?: AbortSignal) {
  const response = await providerFetch("anilist", ANILIST_URL, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ query: anilistQuery, variables }), cache: "no-store" }, callerSignal);
  const payload = await response.json().catch(() => null) as AniListPayload | null;
  const graphQLError = payload?.errors?.map((entry) => text(entry?.message)).filter(Boolean).join("; ");
  if (graphQLError) throw new AnimeProviderError("anilist", 500, "upstream_error", `AniList GraphQL: ${graphQLError}`, undefined, graphQLError);
  return Array.isArray(payload?.data?.Page?.media) ? payload.data.Page.media.map(mapAniList).filter((anime) => anime.id) : [];
}
async function bangumiSearch(query: string, callerSignal?: AbortSignal) {
  const response = await providerFetch("bangumi", `${BANGUMI_ROOT}/search/subjects`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Personal-Vault/1.0 (catalogue lookup)" }, body: JSON.stringify({ keyword: query, sort: "match", filter: { type: [2] } }), cache: "no-store" }, callerSignal);
  const payload = await response.json().catch(() => null) as { data?: unknown[] } | null;
  return Array.isArray(payload?.data) ? payload.data.map(mapBangumi).filter((anime) => anime.id) : [];
}
async function bangumiDetail(externalId: string) {
  const response = await providerFetch("bangumi", `${BANGUMI_ROOT}/subjects/${externalId}`, { headers: { Accept: "application/json", "User-Agent": "Personal-Vault/1.0 (catalogue lookup)" }, cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw new Error("Anime was not found");
  return mapBangumi(payload);
}
async function jikanRequest(path: string, callerSignal?: AbortSignal) {
  const response = await providerFetch("jikan", `${JIKAN_ROOT}${path}`, { headers: { Accept: "application/json" }, cache: "no-store" }, callerSignal);
  return response.json() as Promise<{ data?: unknown }>;
}

function toSearchError(failures: AnimeProviderError[]) {
  const priority: AnimeSearchErrorCode[] = ["rate_limited", "forbidden", "timeout", "upstream_error", "upstream_unavailable", "network", "unknown"];
  const failure = priority.map((code) => failures.find((item) => item.code === code)).find(Boolean) ?? failures[0];
  const statusByCode: Record<AnimeSearchErrorCode, number> = { rate_limited: 429, forbidden: 403, timeout: 504, upstream_error: 500, upstream_unavailable: 503, network: 502, unknown: 502 };
  return new AnimeSearchError(failure?.code ?? "unknown", statusByCode[failure?.code ?? "unknown"], failure?.message ?? "Anime search failed", failure?.retryAfterSeconds, failure?.provider, failure?.responseSnippet);
}

export async function searchAnime(query: string, callerSignal?: AbortSignal): Promise<ExternalAnime[]> {
  const key = normalizeQuery(query);
  const cached = getCachedSearch(key);
  if (cached) return cached;
  const failures: AnimeProviderError[] = [];
  let providerAnswered = false;
  for (const request of [() => anilist({ search: query }, callerSignal), () => bangumiSearch(query, callerSignal)]) {
    try {
      const results = await request();
      providerAnswered = true;
      if (results.length > 0) { const localized = await localizeAnimeTitles(results); cacheSearch(key, localized); return localized; }
    } catch (caught) {
      if (callerSignal?.aborted) throw caught;
      failures.push(caught instanceof AnimeProviderError ? caught : new AnimeProviderError("anilist", 502, "unknown", caught instanceof Error ? caught.message : "Catalogue search failed"));
    }
  }
  // A successful provider with no match is a real no-result. Avoid Jikan in that
  // case because its MyAnimeList upstream has been intermittently returning 504.
  if (providerAnswered) { cacheSearch(key, []); return []; }
  try {
    const result = await jikanRequest(`/anime?${new URLSearchParams({ q: query, limit: "12", sfw: "true", order_by: "score", sort: "desc" })}`, callerSignal);
    const results = Array.isArray(result.data) ? result.data.map(mapJikan).filter((anime) => anime.id) : [];
    const localized = await localizeAnimeTitles(results);
    cacheSearch(key, localized);
    return localized;
  } catch (caught) {
    if (callerSignal?.aborted) throw caught;
    failures.push(caught instanceof AnimeProviderError ? caught : new AnimeProviderError("jikan", 502, "unknown", caught instanceof Error ? caught.message : "Jikan search failed"));
  }
  throw toSearchError(failures);
}

export async function getAnimeDetail(source: AnimeProvider, externalId: string): Promise<ExternalAnime> {
  if (!/^\d{1,12}$/.test(externalId)) throw new Error("Invalid external anime id");
  if (source === "anilist") { const [anime] = await anilist({ id: Number(externalId) }); if (!anime) throw new Error("Anime was not found"); return (await localizeAnimeTitles([anime]))[0]!; }
  if (source === "bangumi") return (await localizeAnimeTitles([await bangumiDetail(externalId)]))[0]!;
  const result = await jikanRequest(`/anime/${externalId}/full`);
  if (!result.data || typeof result.data !== "object") throw new Error("Anime was not found");
  return (await localizeAnimeTitles([mapJikan(result.data)]))[0]!;
}
