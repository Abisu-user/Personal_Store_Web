import type { AnimeSourceAvailability, ExternalAnime } from "@/lib/anime/types";

export type NormalizedAnimeTitle = { normalized: string; base: string; seasonNumber: number | null };
export type Anime1MatchRow = {
  sourceTitle: string;
  normalizedTitle: string;
  sourceUrl: string;
  episodeText: string | null;
  year: number | null;
  seasonText: string | null;
  subtitleGroup: string | null;
  anilistId: number | null;
  manualMatch: boolean;
};
export type ParsedAnime1Row = Anime1MatchRow & { sourceItemKey: string };

const chineseDigits: Record<string, number> = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const romanDigits: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

function parseSeasonNumber(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const roman = romanDigits[value.toLocaleLowerCase()];
  if (roman) return roman;
  if (value === "十") return 10;
  if (value.startsWith("十")) return 10 + (chineseDigits[value.slice(1)] ?? 0);
  if (value.endsWith("十")) return (chineseDigits[value[0]!] ?? 0) * 10;
  if (value.includes("十")) {
    const [left, right] = value.split("十");
    return (chineseDigits[left!] ?? 1) * 10 + (chineseDigits[right!] ?? 0);
  }
  return chineseDigits[value] ?? null;
}

export function normalizeAnimeTitle(input: string): NormalizedAnimeTitle {
  const folded = input.normalize("NFKC").toLocaleLowerCase().replace(/[’‘`]/g, "'");
  const patterns = [
    /第\s*([0-9一二兩三四五六七八九十]+)\s*(?:季|期|章|部)/i,
    /(?:season|series|part)\s*([0-9]+|i{1,3}|iv|v|vi{0,3}|ix|x)\b/i,
    /\bs\s*([0-9]+)\b/i,
    /\s+([2-9]|1[0-9])\s*$/i,
    /\b(i{1,3}|iv|v|vi{0,3}|ix|x)\s*$/i,
  ];
  let seasonNumber: number | null = null;
  for (const pattern of patterns) {
    const match = folded.match(pattern);
    if (match?.[1]) { seasonNumber = parseSeasonNumber(match[1]); break; }
  }
  const withoutSeason = patterns.reduce((value, pattern) => value.replace(pattern, " "), folded)
    .replace(/\b(?:the\s+)?(?:animation|anime|tv)\b/g, " ");
  const clean = (value: string) => value
    .replace(/&(?:amp|#38);/gi, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return { normalized: clean(folded), base: clean(withoutSeason), seasonNumber };
}

function compact(value: string) { return value.replace(/\s+/g, ""); }
function dice(left: string, right: string) {
  const a = compact(left); const b = compact(right);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = new Map<string, number>();
  for (let index = 0; index < a.length - 1; index += 1) grams.set(a.slice(index, index + 2), (grams.get(a.slice(index, index + 2)) ?? 0) + 1);
  let overlap = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const gram = b.slice(index, index + 2); const count = grams.get(gram) ?? 0;
    if (count > 0) { overlap += 1; grams.set(gram, count - 1); }
  }
  return (2 * overlap) / (a.length + b.length - 2);
}

function quarter(value: string | null | undefined) {
  const key = value?.toLocaleLowerCase();
  if (!key) return null;
  if (key.includes("冬") || key === "winter") return "winter";
  if (key.includes("春") || key === "spring") return "spring";
  if (key.includes("夏") || key === "summer") return "summer";
  if (key.includes("秋") || key === "fall") return "fall";
  return null;
}

function variants(anime: ExternalAnime) {
  return Array.from(new Set([anime.titleChinese, anime.titleUserPreferred, anime.title, anime.titleJapanese, anime.titleEnglish, anime.originalTitle, ...(anime.synonyms ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => normalizeAnimeTitle(value))));
}

function scoreCandidate(anime: ExternalAnime, row: Anime1MatchRow) {
  const target = normalizeAnimeTitle(row.sourceTitle);
  let best = 0;
  for (const variant of variants(anime)) {
    if (!variant.base || !target.base) continue;
    if (variant.seasonNumber && target.seasonNumber && variant.seasonNumber !== target.seasonNumber) continue;
    let score = variant.normalized === target.normalized
      ? 0.98
      : variant.base === target.base
        ? (variant.seasonNumber && target.seasonNumber ? 0.95 : 0.87)
        : 0.68 + dice(variant.base, target.base) * 0.22;
    if (anime.releaseYear && row.year) score += anime.releaseYear === row.year ? 0.03 : Math.abs(anime.releaseYear - row.year) > 1 ? -0.08 : 0;
    const animeQuarter = quarter(anime.season); const sourceQuarter = quarter(row.seasonText);
    if (animeQuarter && sourceQuarter) score += animeQuarter === sourceQuarter ? 0.02 : -0.03;
    best = Math.max(best, score);
  }
  return Math.min(1, Math.max(0, best));
}

function statusOnly(status: AnimeSourceAvailability["status"]): AnimeSourceAvailability {
  return { source: "anime1", status, title: null, url: null, episodeText: null, year: null, seasonText: null, subtitleGroup: null };
}

export function matchAnime1(anime: ExternalAnime, rows: Anime1MatchRow[], sourceAvailable = true): AnimeSourceAvailability {
  if (!sourceAvailable) return statusOnly("source_unavailable");
  const manual = rows.find((row) => row.manualMatch && row.anilistId === Number(anime.id));
  const ranked = manual ? [{ row: manual, score: 1 }] : rows
    .map((row) => ({ row, score: scoreCandidate(anime, row) }))
    .filter((candidate) => candidate.score >= 0.68)
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return statusOnly("not_found");
  if (!manual && (best.score < 0.86 || (ranked[1] && best.score - ranked[1].score < 0.025 && ranked[1].row.sourceUrl !== best.row.sourceUrl))) return statusOnly("unknown");
  return { source: "anime1", status: "available", title: best.row.sourceTitle, url: best.row.sourceUrl, episodeText: best.row.episodeText, year: best.row.year, seasonText: best.row.seasonText, subtitleGroup: best.row.subtitleGroup };
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = { amp: "&", quot: "\"", apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLocaleLowerCase()] ?? "";
  });
}
function htmlText(value: string) { return decodeHtmlEntities(value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }
function tableCells(row: string) { return Array.from(row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi), (match) => match[1] ?? ""); }

export function parseAnime1Index(html: string, baseUrl = "https://anime1.me/動畫列表"): ParsedAnime1Row[] {
  for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = Array.from((table[1] ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (match) => match[1] ?? "");
    if (!rows.length) continue;
    const headers = tableCells(rows[0]!).map((value) => htmlText(value).replace(/[\s\/／_-]+/g, ""));
    const titleIndex = headers.findIndex((value) => value.includes("動畫名稱"));
    const episodeIndex = headers.findIndex((value) => value.includes("集數"));
    const yearIndex = headers.findIndex((value) => value.includes("年份"));
    const seasonIndex = headers.findIndex((value) => value.includes("季節"));
    const subtitleIndex = headers.findIndex((value) => value.includes("字幕組"));
    if (titleIndex < 0 || episodeIndex < 0 || yearIndex < 0 || seasonIndex < 0) continue;
    const parsed: ParsedAnime1Row[] = [];
    for (const row of rows.slice(1)) {
      const values = tableCells(row); const titleCell = values[titleIndex];
      if (!titleCell) continue;
      const anchor = titleCell.match(/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/i);
      const href = anchor?.[1] ?? anchor?.[2] ?? anchor?.[3];
      const sourceTitle = htmlText(anchor?.[4] ?? titleCell);
      if (!href || !sourceTitle) continue;
      let url: URL;
      try { url = new URL(decodeHtmlEntities(href), baseUrl); } catch { continue; }
      if (url.protocol !== "https:" || url.hostname !== "anime1.me") continue;
      url.hash = "";
      const yearText = yearIndex >= 0 ? htmlText(values[yearIndex] ?? "") : "";
      parsed.push({
        sourceItemKey: `${url.pathname}${url.search}`,
        sourceTitle,
        normalizedTitle: normalizeAnimeTitle(sourceTitle).normalized,
        sourceUrl: url.toString(),
        episodeText: episodeIndex >= 0 ? htmlText(values[episodeIndex] ?? "") || null : null,
        year: /^\d{4}$/.test(yearText) ? Number(yearText) : null,
        seasonText: seasonIndex >= 0 ? htmlText(values[seasonIndex] ?? "") || null : null,
        subtitleGroup: subtitleIndex >= 0 ? htmlText(values[subtitleIndex] ?? "") || null : null,
        anilistId: null,
        manualMatch: false,
      });
    }
    if (parsed.length) return parsed;
  }
  throw new Error("Anime1 public index table was not found or its required headers changed.");
}
