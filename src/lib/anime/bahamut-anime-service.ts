import "server-only";

/** Public catalogue lookup only: no cookies, user data, playback requests, or video data. */
const SEARCH_URL = process.env.BAHAMUT_ANIME_SEARCH_URL || "https://ani.gamer.com.tw/search.php";
const CACHE_TTL_MS = 30 * 60 * 1_000;
const CACHE_LIMIT = 250;
const TIMEOUT_MS = 9_000;

export type BahamutAnimeMatch = { available: boolean; url: string | null; title: string | null; sn: number | null; lastCheckedAt: string };
type CacheEntry = { expiresAt: number; value: BahamutAnimeMatch };
const lookupCache = new Map<string, CacheEntry>();

export class BahamutLookupError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "BahamutLookupError";
  }
}

const normalize = (value: string) => value.normalize("NFKC").replace(/[\s\-–—:：・!！?？'"「」『』（）()【】\[\]]/g, "").toLocaleLowerCase();
const plainText = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#(?:x[\da-f]+|\d+);/gi, " ").replace(/\s+/g, " ").trim();
const checkedAt = () => new Date().toISOString();
const cacheKey = (titles: string[]) => titles.map(normalize).filter(Boolean).sort().join("|");

function fromCache(key: string) {
  const entry = lookupCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { lookupCache.delete(key); return null; }
  return entry.value;
}
function cache(key: string, value: BahamutAnimeMatch) {
  lookupCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  while (lookupCache.size > CACHE_LIMIT) lookupCache.delete(lookupCache.keys().next().value as string);
  return value;
}
function titleScore(candidate: string, titles: string[]) {
  const source = normalize(candidate);
  return Math.max(0, ...titles.map((title) => {
    const target = normalize(title);
    if (!target) return 0;
    if (source === target) return 100;
    if (source.includes(target) || target.includes(source)) return 70;
    return ([...new Set(target)].filter((character) => source.includes(character)).length / target.length) * 35;
  }));
}
function findCandidates(html: string, titles: string[]) {
  const found = new Map<number, { sn: number; title: string; score: number }>();
  const links = /<a\b[^>]*\bhref=["']([^"']*(?:animeVideo|animeRef)\.php\?[^"']*\bsn=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(links)) {
    const sn = Number(match[2]);
    if (!Number.isSafeInteger(sn) || sn <= 0) continue;
    const title = plainText(match[3]);
    const score = titleScore(title, titles);
    const prior = found.get(sn);
    if (!prior || score > prior.score) found.set(sn, { sn, title, score });
  }
  return [...found.values()].sort((left, right) => right.score - left.score || left.sn - right.sn);
}

/** Queries only the public official search page. Caller decides how to handle a failure. */
export async function findBahamutAnime(titles: Array<string | null | undefined>): Promise<BahamutAnimeMatch> {
  const names = [...new Set(titles.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))].slice(0, 4);
  const key = cacheKey(names);
  if (!key) return { available: false, url: null, title: null, sn: null, lastCheckedAt: checkedAt() };
  const hit = fromCache(key);
  if (hit) return hit;
  const url = new URL(SEARCH_URL);
  url.searchParams.set("keyword", names[0]);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (caught) {
    const reason = caught instanceof Error && caught.name === "AbortError" ? "Bahamut catalogue request timed out" : caught instanceof Error ? caught.message : "Bahamut catalogue request failed";
    throw new BahamutLookupError(reason);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new BahamutLookupError(`Bahamut catalogue returned ${response.status}`, response.status);
  const html = await response.text();
  if (!html.includes("animeRef.php") && !html.includes("animeVideo.php")) throw new BahamutLookupError("Bahamut catalogue returned an unexpected response", response.status);
  const match = findCandidates(html, names)[0];
  if (!match || match.score < 30) return cache(key, { available: false, url: null, title: null, sn: null, lastCheckedAt: checkedAt() });
  return cache(key, { available: true, url: `https://ani.gamer.com.tw/animeVideo.php?sn=${match.sn}`, title: match.title || names[0], sn: match.sn, lastCheckedAt: checkedAt() });
}
