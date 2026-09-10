import "server-only";
import OpenCC from "opencc-js";
import type { ExternalAnime } from "@/lib/anime/types";

const KITSU_ROOT = (process.env.ANIME_KITSU_API_URL || "https://kitsu.io/api/edge").replace(/\/+$/, "");
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const CACHE_TTL_MS = 7 * 24 * 60 * 60_000;
const toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });
const cache = new Map<string, { until: number; coverUrl: string | null; titleChinese: string | null }>();
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const hasChinese = (value: string | null) => Boolean(value && /[\u3400-\u9fff]/.test(value));
const chunks = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

type KitsuMapping = { id?: unknown; attributes?: { externalId?: unknown }; relationships?: { item?: { data?: { id?: unknown } } } };
type KitsuAnime = { id?: unknown; type?: unknown; attributes?: { posterImage?: { large?: unknown; original?: unknown; medium?: unknown } } };

async function fetchKitsuCovers(ids: string[]) {
  const result = new Map<string, string>();
  await Promise.all(chunks(ids, 20).map(async (group) => {
    const params = new URLSearchParams({ "filter[externalSite]": "myanimelist/anime", "filter[externalId]": group.join(","), include: "item", "page[limit]": "20" });
    const response = await fetch(`${KITSU_ROOT}/mappings?${params}`, { headers: { Accept: "application/vnd.api+json" }, signal: AbortSignal.timeout(6_000), cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json().catch(() => null) as { data?: KitsuMapping[]; included?: KitsuAnime[] } | null;
    const animeById = new Map((payload?.included ?? []).filter((item) => item.type === "anime").map((item) => [String(item.id), item]));
    for (const mapping of payload?.data ?? []) {
      const malId = text(mapping.attributes?.externalId);
      const anime = animeById.get(String(mapping.relationships?.item?.data?.id ?? ""));
      const cover = text(anime?.attributes?.posterImage?.large) ?? text(anime?.attributes?.posterImage?.original) ?? text(anime?.attributes?.posterImage?.medium);
      if (malId && cover) result.set(malId, cover);
    }
  }));
  return result;
}

async function fetchWikidataTitles(ids: string[]) {
  const values = ids.filter((id) => /^\d+$/.test(id)).map((id) => JSON.stringify(id)).join(" ");
  const query = `SELECT ?mal ?itemLabel WHERE { VALUES ?mal { ${values} } ?item wdt:P4086 ?mal. SERVICE wikibase:label { bd:serviceParam wikibase:language "zh-tw,zh-hant,zh,ja,en". } }`;
  const params = new URLSearchParams({ format: "json", query });
  const response = await fetch(`${WIKIDATA_ENDPOINT}?${params}`, { headers: { Accept: "application/sparql-results+json", "User-Agent": "PersonalVault/1.0" }, signal: AbortSignal.timeout(6_000), cache: "no-store" });
  if (!response.ok) return new Map<string, string>();
  const payload = await response.json().catch(() => null) as { results?: { bindings?: Array<{ mal?: { value?: unknown }; itemLabel?: { value?: unknown } }> } } | null;
  const result = new Map<string, string>();
  for (const binding of payload?.results?.bindings ?? []) {
    const id = text(binding.mal?.value); const label = text(binding.itemLabel?.value);
    if (id && hasChinese(label)) result.set(id, toTraditional(label!));
  }
  return result;
}

async function translateWithOpenAI(items: ExternalAnime[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !items.length) return new Map<string, string>();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_ANIME_MODEL || process.env.OPENAI_VOCABULARY_MODEL || "gpt-4.1-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你是台灣動漫資料編輯。請為每筆日本成人動畫標題提供自然繁體中文標題；有通行譯名優先使用通行譯名，否則忠實翻譯或音譯。只輸出 JSON：{\"items\":[{\"id\":\"...\",\"titleZhTw\":\"...\"}]}。不得省略輸入項目，不要加入分級或說明。" },
        { role: "user", content: JSON.stringify(items.map((item) => ({ id: item.id, japanese: item.titleJapanese, english: item.titleEnglish, romaji: item.originalTitle }))) },
      ],
    }),
    signal: AbortSignal.timeout(10_000), cache: "no-store",
  });
  if (!response.ok) return new Map<string, string>();
  const payload = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
  const content = text(payload?.choices?.[0]?.message?.content);
  if (!content) return new Map<string, string>();
  try {
    const parsed = JSON.parse(content) as { items?: Array<{ id?: unknown; titleZhTw?: unknown }> };
    return new Map((parsed.items ?? []).flatMap((item): Array<[string, string]> => {
      const id = text(item.id); const title = text(item.titleZhTw);
      return id && hasChinese(title) ? [[id, toTraditional(title!)]] : [];
    }));
  } catch { return new Map<string, string>(); }
}

async function translateWithMyMemory(items: ExternalAnime[]) {
  const result = new Map<string, string>();
  const groups = new Map<"ja" | "en", Array<{ id: string; value: string }>>();
  for (const item of items) {
    const japanese = text(item.titleJapanese); const english = text(item.titleEnglish) ?? text(item.originalTitle);
    const useJapanese = Boolean(japanese && /[\u3040-\u30ff\u3400-\u9fff]/.test(japanese));
    const value = useJapanese ? japanese : english ?? japanese;
    if (value) groups.set(useJapanese ? "ja" : "en", [...(groups.get(useJapanese ? "ja" : "en") ?? []), { id: item.id, value }]);
  }
  for (const [source, entries] of groups) {
    for (const group of chunks(entries, 8)) {
      const numbered = group.map((entry, index) => `${index + 1}. ${entry.value}`).join("\n");
      const url = new URL("https://api.mymemory.translated.net/get");
      url.searchParams.set("q", numbered); url.searchParams.set("langpair", `${source}|zh-TW`);
      try {
        const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6_000), cache: "no-store" });
        if (!response.ok) continue;
        const payload = await response.json().catch(() => null) as { responseStatus?: number; responseData?: { translatedText?: unknown } } | null;
        if (payload?.responseStatus && payload.responseStatus !== 200) continue;
        const translated = text(payload?.responseData?.translatedText);
        for (const line of translated?.split(/\r?\n/) ?? []) {
          const match = line.match(/^\s*(\d+)[.、．]\s*(.+?)\s*$/);
          const entry = match ? group[Number(match[1]) - 1] : null; const title = text(match?.[2]);
          if (entry && hasChinese(title)) result.set(entry.id, toTraditional(title!));
        }
      } catch { /* Keep the Japanese title when the free translation provider is unavailable. */ }
    }
  }
  return result;
}

async function translateMissingTitles(items: ExternalAnime[]) {
  const ai = await translateWithOpenAI(items).catch(() => new Map<string, string>());
  const unresolved = items.filter((item) => !ai.has(item.id));
  const free = await translateWithMyMemory(unresolved);
  return new Map([...free, ...ai]);
}

export async function enrichAdultCatalogue(items: ExternalAnime[]) {
  const ids = items.map((item) => item.id).filter((id) => /^\d+$/.test(id));
  const missing = ids.filter((id) => !cache.has(id) || cache.get(id)!.until <= Date.now());
  if (missing.length) {
    const [coversResult, titlesResult] = await Promise.allSettled([fetchKitsuCovers(missing), fetchWikidataTitles(missing)]);
    const covers = coversResult.status === "fulfilled" ? coversResult.value : new Map<string, string>();
    const titles = titlesResult.status === "fulfilled" ? titlesResult.value : new Map<string, string>();
    const untranslated = items.filter((item) => missing.includes(item.id) && !titles.has(item.id));
    const translated = await translateMissingTitles(untranslated).catch(() => new Map<string, string>());
    for (const id of missing) {
      const coverUrl = covers.get(id) ?? null; const titleChinese = titles.get(id) ?? translated.get(id) ?? null;
      cache.set(id, { until: Date.now() + (coverUrl && titleChinese ? CACHE_TTL_MS : 30 * 60_000), coverUrl, titleChinese });
    }
  }
  return items.map((item) => {
    const enriched = cache.get(item.id);
    return enriched ? { ...item, coverUrl: item.coverUrl ?? enriched.coverUrl, bannerUrl: item.bannerUrl ?? enriched.coverUrl, titleChinese: item.titleChinese ?? enriched.titleChinese } : item;
  });
}
