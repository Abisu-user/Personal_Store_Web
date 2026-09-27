import "server-only";
import OpenCC from "opencc-js";

/**
 * AniList has excellent catalogue data, but it intentionally does not carry a
 * Traditional Chinese title field.  Bangumi's subject index supplies a
 * community-maintained Chinese title.  We only use it when the Japanese or
 * original title is a confident match; otherwise the original title remains
 * visible instead of showing a possibly unrelated translation.
 */
const BANGUMI_ROOT = (process.env.ANIME_BANGUMI_API_URL || "https://api.bgm.tv/v0").replace(/\/+$/, "");
const LOOKUP_TIMEOUT_MS = 4_000;
const FOUND_TTL_MS = 7 * 24 * 60 * 60_000;
const MISS_TTL_MS = 3 * 60 * 60_000;
const MAX_CONCURRENT_LOOKUPS = 4;
const CHINESE_SEARCH_TTL_MS = 15 * 60_000;
const CHINESE_SEARCH_LIMIT = 8;

type LocalizableAnime = {
  id: string;
  title: string;
  titleJapanese?: string | null;
  titleEnglish?: string | null;
  titleChinese?: string | null;
  originalTitle?: string | null;
  source?: string;
  externalId?: string;
  externalSource?: string;
};
type CacheEntry = { until: number; title: string | null };
type BangumiSubject = { name?: unknown; name_cn?: unknown };
type BangumiSearchSubject = BangumiSubject & {
  id?: unknown;
  date?: unknown;
  type?: unknown;
  nsfw?: unknown;
  mal_id?: unknown;
  platform?: unknown;
  eps?: unknown;
  total_episodes?: unknown;
};
export type BangumiChineseCandidate = {
  id: number;
  name: string;
  nameChinese: string | null;
  year: number | null;
  malId: number | null;
  format: string | null;
  episodes: number | null;
};

const toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });
const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });
const titleCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();
const chineseSearchCache = new Map<string, { until: number; candidates: BangumiChineseCandidate[] }>();
const chineseSearchInFlight = new Map<string, Promise<BangumiChineseCandidate[]>>();
const queue: Array<() => void> = [];
let activeLookups = 0;

const clean = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const canonical = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
const unique = (values: Array<string | null | undefined>) => [...new Set(values.map(clean).filter((value): value is string => Boolean(value)))];

export function isChineseAnimeSearch(query: string) {
  return /\p{Script=Han}/u.test(query) && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query);
}

function chineseRelevance(candidate: BangumiChineseCandidate, query: string) {
  const needle = canonical(toSimplified(query));
  const title = canonical(toSimplified(candidate.nameChinese ?? candidate.name));
  if (!needle || !title) return 0;
  if (title === needle) return 3;
  if (title.startsWith(needle)) return 2;
  return title.includes(needle) ? 1 : 0;
}

async function searchBangumiSubjects(keyword: string): Promise<BangumiChineseCandidate[]> {
  const response = await fetch(`${BANGUMI_ROOT}/search/subjects?limit=10`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Personal-Vault/1.0 (traditional-title search)",
    },
    body: JSON.stringify({ keyword, sort: "match", filter: { type: [2], nsfw: false } }),
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Bangumi search returned ${response.status}`);
  const payload = await response.json().catch(() => null) as { data?: BangumiSearchSubject[] } | null;
  return (Array.isArray(payload?.data) ? payload.data : []).flatMap((row) => {
    const id = Number(row.id);
    const name = clean(row.name);
    if (!Number.isSafeInteger(id) || id <= 0 || !name || row.nsfw === true || (row.type != null && row.type !== 2)) return [];
    const date = clean(row.date);
    const malId = Number(row.mal_id);
    const episodes = Number(row.total_episodes ?? row.eps);
    return [{
      id,
      name,
      nameChinese: clean(row.name_cn) ? toTraditional(clean(row.name_cn)!) : null,
      year: date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null,
      malId: Number.isSafeInteger(malId) && malId > 0 ? malId : null,
      format: clean(row.platform),
      episodes: Number.isSafeInteger(episodes) && episodes > 0 ? episodes : null,
    }];
  });
}

/** Optional discovery candidates; failures never replace or block AniList results. */
export function searchBangumiChineseCandidates(query: string): Promise<BangumiChineseCandidate[]> {
  const key = query.trim().normalize("NFKC").toLocaleLowerCase();
  const cached = chineseSearchCache.get(key);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.candidates);
  const active = chineseSearchInFlight.get(key);
  if (active) return active;
  const keywords = unique([query.trim(), toSimplified(query.trim())]);
  const task = Promise.allSettled(keywords.map(searchBangumiSubjects)).then((results) => {
    const found = new Map<number, BangumiChineseCandidate>();
    results.forEach((result) => {
      if (result.status === "fulfilled") result.value.forEach((candidate) => found.set(candidate.id, found.get(candidate.id) ?? candidate));
      else console.warn("[anime-chinese-search] Bangumi candidate search unavailable", { message: result.reason instanceof Error ? result.reason.message : "unknown" });
    });
    const candidates = [...found.values()]
      .filter((candidate) => chineseRelevance(candidate, query) > 0)
      .sort((left, right) => chineseRelevance(right, query) - chineseRelevance(left, query))
      .slice(0, CHINESE_SEARCH_LIMIT);
    if (chineseSearchCache.size >= 100) chineseSearchCache.delete(chineseSearchCache.keys().next().value!);
    chineseSearchCache.set(key, { until: Date.now() + (found.size ? CHINESE_SEARCH_TTL_MS : MISS_TTL_MS), candidates });
    return candidates;
  }).finally(() => chineseSearchInFlight.delete(key));
  chineseSearchInFlight.set(key, task);
  return task;
}

function cacheKey(anime: LocalizableAnime) {
  return `${anime.source ?? anime.externalSource ?? "unknown"}:${anime.externalId ?? anime.id}`;
}

function candidates(anime: LocalizableAnime) {
  // Native Japanese is the most reliable way to identify the same work across
  // AniList and Bangumi; retain other fields for titles without a native form.
  return unique([anime.titleJapanese, anime.originalTitle, anime.titleEnglish, anime.title]);
}

async function scheduled<T>(job: () => Promise<T>) {
  if (activeLookups >= MAX_CONCURRENT_LOOKUPS) await new Promise<void>((resolve) => queue.push(resolve));
  activeLookups += 1;
  try {
    return await job();
  } finally {
    activeLookups -= 1;
    queue.shift()?.();
  }
}

function scoreMatch(subject: BangumiSubject, terms: string[]) {
  const subjectNames = unique([clean(subject.name), clean(subject.name_cn)]).map(canonical).filter(Boolean);
  let score = 0;
  for (const term of terms.map(canonical).filter(Boolean)) {
    for (const name of subjectNames) {
      if (name === term) score = Math.max(score, 100);
      else if (name.length >= 4 && term.length >= 4 && (name.includes(term) || term.includes(name))) score = Math.max(score, 65);
    }
  }
  return score;
}

async function lookUpTraditionalTitle(anime: LocalizableAnime): Promise<string | null> {
  const key = cacheKey(anime);
  const cached = titleCache.get(key);
  if (cached && cached.until > Date.now()) return cached.title;
  if (cached) titleCache.delete(key);
  const current = inFlight.get(key);
  if (current) return current;

  const lookup = scheduled(async () => {
    const terms = candidates(anime);
    // Library rows created by older versions were stored as `manual` even
    // when they came from AniList.  They still carry an original/Japanese
    // title, which is safe to enrich.  A truly handwritten record has no
    // alternate title and is intentionally left untouched.
    if (!terms.length || (anime.externalSource === "manual" && !anime.titleJapanese && !anime.originalTitle && !anime.titleEnglish)) return null;
    const timeout = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
    try {
      const response = await fetch(`${BANGUMI_ROOT}/search/subjects`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Personal-Vault/1.0 (traditional-title lookup)",
        },
        body: JSON.stringify({ keyword: terms[0], sort: "match", filter: { type: [2] } }),
        signal: timeout,
        cache: "no-store",
      });
      if (!response.ok) {
        console.info("[anime-title-localizer] Bangumi title lookup unavailable", { status: response.status });
        return null;
      }
      const payload = await response.json().catch(() => null) as { data?: BangumiSubject[] } | null;
      const match = Array.isArray(payload?.data)
        ? payload.data.map((subject) => ({ subject, score: scoreMatch(subject, terms) })).sort((left, right) => right.score - left.score)[0]
        : null;
      // The search endpoint is fuzzy.  Require an actual title relationship,
      // rather than trusting a merely popular first result.
      return match && match.score >= 65 ? clean(match.subject.name_cn) : null;
    } catch (cause) {
      console.info("[anime-title-localizer] Bangumi title lookup failed", {
        timeout: timeout.aborted,
        error: cause instanceof Error ? cause.name : "unknown",
      });
      return null;
    }
  }).then((title) => {
    titleCache.set(key, { until: Date.now() + (title ? FOUND_TTL_MS : MISS_TTL_MS), title });
    return title;
  }).finally(() => inFlight.delete(key));

  inFlight.set(key, lookup);
  return lookup;
}

/**
 * Returns the same record shape with `titleChinese` upgraded to Traditional
 * Chinese when a trusted source has one.  The user's `title` is deliberately
 * preserved: it is the editable library title and must never be replaced by
 * background metadata enrichment after an edit.
 */
export async function localizeAnimeTitles<T extends LocalizableAnime>(items: T[]): Promise<T[]> {
  return Promise.all(items.map(async (anime) => {
    const knownChinese = clean(anime.titleChinese);
    const chinese = knownChinese ? toTraditional(knownChinese) : await lookUpTraditionalTitle(anime).then((value) => value ? toTraditional(value) : null);
    return chinese ? { ...anime, titleChinese: chinese } : anime;
  }));
}
