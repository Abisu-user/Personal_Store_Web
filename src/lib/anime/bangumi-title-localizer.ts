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

const toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });
const titleCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();
const queue: Array<() => void> = [];
let activeLookups = 0;

const clean = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const canonical = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
const unique = (values: Array<string | null | undefined>) => [...new Set(values.map(clean).filter((value): value is string => Boolean(value)))];

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
 * Returns the same record shape, with `title` and `titleChinese` upgraded to
 * a Traditional Chinese title when a trusted source has one.  Existing
 * Chinese titles are converted too, covering titles saved before this change.
 */
export async function localizeAnimeTitles<T extends LocalizableAnime>(items: T[]): Promise<T[]> {
  return Promise.all(items.map(async (anime) => {
    const knownChinese = clean(anime.titleChinese);
    const chinese = knownChinese ? toTraditional(knownChinese) : await lookUpTraditionalTitle(anime).then((value) => value ? toTraditional(value) : null);
    return chinese ? { ...anime, title: chinese, titleChinese: chinese } : anime;
  }));
}
