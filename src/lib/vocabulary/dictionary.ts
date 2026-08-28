import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type DictionaryLanguage = "ja" | "en";
export type LookupInputLanguage = "zh" | DictionaryLanguage;
export type DictionaryMatchKind = "exact" | "normalized" | "dictionary-form" | "prefix" | "contains";
export type DictionaryEntry = {
  id: string;
  language: DictionaryLanguage;
  word: string;
  reading: string | null;
  kana: string | null;
  romaji: string | null;
  ipa: string | null;
  pronunciation: string | null;
  partOfSpeech: string | null;
  primaryTranslation: string | null;
  englishDefinition: string | null;
  meanings: string[];
  examples: { sentence: string; translation: string | null }[];
  synonyms: string[];
  antonyms: string[];
  source: "Jisho" | "Free Dictionary";
  matchKind?: DictionaryMatchKind;
  dictionaryForm?: string | null;
  isCommon?: boolean;
};
export type DictionarySearchResult = {
  exact: DictionaryEntry[];
  related: DictionaryEntry[];
  normalizedQuery: string;
  dictionaryForm: string | null;
};

const CACHE_HOURS = 12;
const inMemoryTranslations = new Map<string, { expiresAt: number; value: string | null }>();

export class DictionaryProviderError extends Error {
  constructor(public readonly code: "TIMEOUT" | "NETWORK" | "UPSTREAM", public readonly provider: string, public readonly status?: number) {
    super(`${provider}:${code}${status ? `:${status}` : ""}`);
  }
}

function normalize(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function toHiragana(value: string) {
  return value.replace(/[\u30a1-\u30f6]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export function normalizeDictionaryQuery(language: DictionaryLanguage, value: string) {
  const normalized = normalize(value);
  return language === "ja" ? toHiragana(normalized).replace(/[\s・]/g, "") : normalized;
}

function isNonLatinQuery(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 6_500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new DictionaryProviderError("TIMEOUT", new URL(url).hostname);
    throw new DictionaryProviderError("NETWORK", new URL(url).hostname);
  } finally {
    clearTimeout(timeout);
  }
}

async function cached<T>(provider: "japanese_dictionary" | "english_dictionary", language: DictionaryLanguage, query: string, loader: () => Promise<T>): Promise<T> {
  const normalizedQuery = normalizeDictionaryQuery(language, query);
  const admin = createAdminClient();
  try {
    const { data } = await admin.from("vocabulary_lookup_cache").select("payload,expires_at").eq("provider", provider).eq("language", language).eq("normalized_query", normalizedQuery).maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) return data.payload as T;
  } catch {
    // Cached dictionaries are an optimisation; the source lookup must still work before a migration is applied.
  }
  const payload = await loader();
  try {
    await admin.from("vocabulary_lookup_cache").upsert({ provider, language, normalized_query: normalizedQuery, payload, expires_at: new Date(Date.now() + CACHE_HOURS * 60 * 60 * 1000).toISOString() }, { onConflict: "provider,language,normalized_query" });
  } catch {
    // Do not make dictionary availability depend on cache writes.
  }
  return payload;
}

export function detectLookupInputLanguage(value: string): LookupInputLanguage {
  if (/[\u3040-\u30ff]/.test(value)) return "ja";
  if (/[\u3400-\u9fff]/.test(value)) return "zh";
  return "en";
}

export async function translateDictionaryText(value: string, source: "zh-TW" | "ja" | "en", target: "zh-TW" | "ja" | "en") {
  if (!value.trim() || source === target) return value.trim() || null;
  const key = `${source}:${target}:${normalize(value)}`;
  const memory = inMemoryTranslations.get(key);
  if (memory && memory.expiresAt > Date.now()) return memory.value;
  try {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", source);
    url.searchParams.set("tl", target);
    url.searchParams.append("dt", "t");
    url.searchParams.set("q", value);
    const response = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json", "User-Agent": "Personal-Vault/1.0 vocabulary translation" } }, 4_000);
    if (!response.ok) throw new DictionaryProviderError("UPSTREAM", "Google Translate", response.status);
    const body = await response.json() as Array<Array<Array<string | null>>>;
    const translated = body[0]?.map((part) => part[0] ?? "").join("").trim() || null;
    inMemoryTranslations.set(key, { value: translated, expiresAt: Date.now() + 30 * 60 * 1000 });
    return translated;
  } catch {
    inMemoryTranslations.set(key, { value: null, expiresAt: Date.now() + 2 * 60 * 1000 });
    return null;
  }
}

function translationKey(language: DictionaryLanguage, word: string) {
  return `${language}:${normalizeDictionaryQuery(language, word)}`;
}

/** A translation cache is deliberately separate from dictionary facts. */
export async function resolveChineseTranslation(entry: DictionaryEntry) {
  const normalizedWord = normalizeDictionaryQuery(entry.language, entry.word);
  const key = translationKey(entry.language, entry.word);
  const memory = inMemoryTranslations.get(key);
  if (memory && memory.expiresAt > Date.now()) return memory.value;
  const admin = createAdminClient();
  try {
    const { data } = await admin.from("dictionary_translations").select("primary_meaning").eq("source_language", entry.language).eq("normalized_word", normalizedWord).eq("target_language", "zh-TW").maybeSingle();
    if (data?.primary_meaning) {
      inMemoryTranslations.set(key, { value: data.primary_meaning, expiresAt: Date.now() + 30 * 60 * 1000 });
      return data.primary_meaning;
    }
  } catch {
    // The new shared table is optional until its migration is applied.
  }
  const phrase = entry.language === "en" ? (entry.meanings.slice(0, 3).join("；") || entry.word) : entry.word;
  const translated = await translateDictionaryText(phrase, entry.language, "zh-TW");
  inMemoryTranslations.set(key, { value: translated, expiresAt: Date.now() + 30 * 60 * 1000 });
  if (translated) {
    try {
      await admin.from("dictionary_translations").upsert({ source_language: entry.language, normalized_word: normalizedWord, target_language: "zh-TW", primary_meaning: translated, meanings_json: [translated], source: "translation-fallback", verified: false, updated_at: new Date().toISOString() }, { onConflict: "source_language,normalized_word,target_language" });
    } catch {
      // Translation is still returned if persistence is unavailable.
    }
  }
  return translated;
}

function hasExactJapaneseForm(entry: DictionaryEntry, query: string) {
  const normalized = normalizeDictionaryQuery("ja", query);
  return [entry.word, entry.reading, entry.kana].filter((value): value is string => Boolean(value)).some((value) => normalizeDictionaryQuery("ja", value) === normalized);
}

function japaneseMatch(entry: DictionaryEntry, query: string, dictionaryForm: string | null): { score: number; kind: DictionaryMatchKind } {
  const normalized = normalizeDictionaryQuery("ja", query);
  const forms = [entry.word, entry.reading, entry.kana].filter((value): value is string => Boolean(value)).map((value) => normalizeDictionaryQuery("ja", value));
  if (forms.some((value) => value === normalized)) return { score: 100_000 + (entry.isCommon ? 500 : 0), kind: "exact" };
  if (dictionaryForm && forms.some((value) => value === normalizeDictionaryQuery("ja", dictionaryForm))) return { score: 80_000 + (entry.isCommon ? 500 : 0), kind: "dictionary-form" };
  if (forms.some((value) => value.startsWith(normalized))) return { score: 20_000 + (entry.isCommon ? 500 : 0), kind: "prefix" };
  if (forms.some((value) => value.includes(normalized))) return { score: 10_000 + (entry.isCommon ? 500 : 0), kind: "contains" };
  return { score: entry.isCommon ? 500 : 0, kind: "contains" };
}

function englishMatch(entry: DictionaryEntry, query: string, dictionaryForm: string | null): { score: number; kind: DictionaryMatchKind } {
  const normalized = normalizeDictionaryQuery("en", query);
  const word = normalizeDictionaryQuery("en", entry.word);
  if (word === normalized) return { score: 100_000, kind: "exact" };
  if (dictionaryForm && word === normalizeDictionaryQuery("en", dictionaryForm)) return { score: 80_000, kind: "dictionary-form" };
  if (word.startsWith(normalized)) return { score: 20_000, kind: "prefix" };
  return { score: word.includes(normalized) ? 10_000 : 0, kind: "contains" };
}

function rankEntries(language: DictionaryLanguage, entries: DictionaryEntry[], query: string, dictionaryForm: string | null = null): DictionarySearchResult {
  const seen = new Set<string>();
  const ranked = entries.map((entry) => {
    const match = language === "ja" ? japaneseMatch(entry, query, dictionaryForm) : englishMatch(entry, query, dictionaryForm);
    return { ...entry, matchKind: match.kind, dictionaryForm: match.kind === "dictionary-form" ? dictionaryForm : null, score: match.score };
  }).filter((entry) => {
    const key = `${normalizeDictionaryQuery(language, entry.word)}:${normalizeDictionaryQuery(language, entry.reading || "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => right.score - left.score || left.word.localeCompare(right.word, language === "ja" ? "ja" : "en"));
  const exact = ranked.filter((entry) => entry.matchKind === "exact" || entry.matchKind === "dictionary-form").slice(0, 8).map(({ score: _score, ...entry }) => entry);
  const exactKeys = new Set(exact.map((entry) => entry.id));
  const related = ranked.filter((entry) => !exactKeys.has(entry.id) && entry.score > 0).slice(0, 10).map(({ score: _score, ...entry }) => entry);
  return { exact, related, normalizedQuery: normalizeDictionaryQuery(language, query), dictionaryForm };
}

type JishoItem = { slug?: string; is_common?: boolean; japanese?: Array<{ word?: string; reading?: string }>; senses?: Array<{ english_definitions?: string[]; parts_of_speech?: string[] }> };

function jishoEntries(query: string, data: JishoItem[]) {
  return data.slice(0, 30).map((item, index) => {
    const spellings = item.japanese ?? [];
    const spelling = spellings.find((candidate) => normalizeDictionaryQuery("ja", candidate.word || candidate.reading || "") === normalizeDictionaryQuery("ja", query)) ?? spellings[0] ?? {};
    const meanings = [...new Set((item.senses ?? []).flatMap((sense) => sense.english_definitions ?? []))].slice(0, 10);
    const parts = [...new Set((item.senses ?? []).flatMap((sense) => sense.parts_of_speech ?? []).filter((part) => !part.startsWith("Wikipedia")))];
    return { id: `jisho-${item.slug ?? spelling.word ?? spelling.reading ?? query}-${index}`, language: "ja" as const, word: spelling.word ?? spelling.reading ?? query, reading: spelling.reading ?? null, kana: spelling.reading ?? null, romaji: null, ipa: null, pronunciation: null, partOfSpeech: parts.join("、") || null, primaryTranslation: null, englishDefinition: meanings.join("；") || null, meanings, examples: [], synonyms: [], antonyms: [], source: "Jisho" as const, isCommon: Boolean(item.is_common) } satisfies DictionaryEntry;
  });
}

async function fetchJisho(query: string) {
  return cached("japanese_dictionary", "ja", query, async () => {
    const response = await fetchWithTimeout(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(query)}`, { headers: { Accept: "application/json", "User-Agent": "Personal-Vault/1.0 dictionary lookup" } });
    if (response.status === 404) return [] as DictionaryEntry[];
    if (!response.ok) throw new DictionaryProviderError("UPSTREAM", "Jisho", response.status);
    const body = await response.json() as { data?: JishoItem[] };
    return jishoEntries(query, body.data ?? []);
  });
}

export class JapaneseMorphologyService {
  static dictionaryForms(value: string) {
    const query = normalizeDictionaryQuery("ja", value);
    const candidates = new Set<string>();
    const add = (candidate: string) => { if (candidate.length > 1) candidates.add(candidate); };
    const strip = (suffix: string) => query.slice(0, -suffix.length);
    if (/ませんでした$/.test(query)) add(`${strip("ませんでした")}る`);
    if (/ました$/.test(query)) add(`${strip("ました")}る`);
    if (/ません$/.test(query)) add(`${strip("ません")}る`);
    if (/ます$/.test(query)) add(`${strip("ます")}る`);
    if (/なかった$/.test(query)) add(`${strip("なかった")}る`);
    if (/ない$/.test(query)) add(`${strip("ない")}る`);
    if (/(られた|られる|られない)$/.test(query)) add(`${query.replace(/(られた|られる|られない)$/, "")}る`);
    if (/(ている|ていた|ていない)$/.test(query)) add(query.replace(/(ている|ていた|ていない)$/, ""));
    if (/(でいる|でいた|でいない)$/.test(query)) add(query.replace(/(でいる|でいた|でいない)$/, ""));
    if (/んで(いる|いた|いない)$/.test(query)) {
      const stem = query.replace(/んで(いる|いた|いない)$/, "");
      ["む", "ぶ", "ぬ"].forEach((ending) => add(`${stem}${ending}`));
    }
    if (/って(いる|いた|いない)$/.test(query)) {
      const stem = query.replace(/って(いる|いた|いない)$/, "");
      ["う", "つ", "る"].forEach((ending) => add(`${stem}${ending}`));
    }
    if (/いて(いる|いた|いない)$/.test(query)) add(`${query.replace(/いて(いる|いた|いない)$/, "")}く`);
    const endings: Array<[RegExp, string[]]> = [[/して$/, ["する"]], [/した$/, ["する"]], [/いて$/, ["く"]], [/いた$/, ["く"]], [/いで$/, ["ぐ"]], [/いだ$/, ["ぐ"]], [/んで$/, ["む", "ぶ", "ぬ"]], [/んだ$/, ["む", "ぶ", "ぬ"]], [/って$/, ["う", "つ", "る"]], [/った$/, ["う", "つ", "る"]]];
    for (const [pattern, endingsForStem] of endings) {
      if (!pattern.test(query)) continue;
      const stem = query.replace(pattern, "");
      endingsForStem.forEach((ending) => add(`${stem}${ending}`));
    }
    return [...candidates].filter((candidate) => candidate !== query).slice(0, 5);
  }
}

export class JapaneseDictionaryService {
  async search(query: string): Promise<DictionarySearchResult> {
    const direct = await fetchJisho(query);
    const directRanked = rankEntries("ja", direct, query);
    if (directRanked.exact.length) return directRanked;
    const forms = JapaneseMorphologyService.dictionaryForms(query);
    if (forms.length) {
      const matches = await Promise.all(forms.map(async (form) => ({ form, entries: await fetchJisho(form).catch(() => []) })));
      const selected = matches.find(({ form, entries }) => entries.some((entry) => hasExactJapaneseForm(entry, form)));
      if (selected) {
        const selectedRanked = rankEntries("ja", selected.entries, selected.form, selected.form);
        const exact = selectedRanked.exact.map((entry) => ({ ...entry, matchKind: "dictionary-form" as const, dictionaryForm: selected.form }));
        const related = rankEntries("ja", direct, query).related;
        return { exact, related, normalizedQuery: normalizeDictionaryQuery("ja", query), dictionaryForm: selected.form };
      }
    }
    return directRanked;
  }
}

function englishDictionaryForms(value: string) {
  const word = normalizeDictionaryQuery("en", value);
  const candidates = new Set<string>();
  if (/ies$/.test(word)) candidates.add(`${word.slice(0, -3)}y`);
  if (/ied$/.test(word)) candidates.add(`${word.slice(0, -3)}y`);
  if (/ing$/.test(word) && word.length > 5) { candidates.add(word.slice(0, -3)); candidates.add(`${word.slice(0, -3)}e`); }
  if (/ed$/.test(word) && word.length > 4) { candidates.add(word.slice(0, -2)); candidates.add(`${word.slice(0, -1)}`); }
  if (/es$/.test(word) && word.length > 4) candidates.add(word.slice(0, -2));
  if (/s$/.test(word) && word.length > 3) candidates.add(word.slice(0, -1));
  return [...candidates].filter((candidate) => candidate.length > 1 && candidate !== word).slice(0, 4);
}

async function fetchEnglish(query: string) {
  if (isNonLatinQuery(query) || !/[a-z]/i.test(query)) return [] as DictionaryEntry[];
  return cached("english_dictionary", "en", query, async () => {
    const response = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`, { headers: { Accept: "application/json", "User-Agent": "Personal-Vault/1.0 dictionary lookup" } });
    if (response.status === 404) return [] as DictionaryEntry[];
    if (!response.ok) throw new DictionaryProviderError("UPSTREAM", "Free Dictionary", response.status);
    const body = await response.json() as Array<{ word?: string; phonetic?: string; phonetics?: Array<{ text?: string; audio?: string }>; meanings?: Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string; example?: string; synonyms?: string[]; antonyms?: string[] }> }> }>;
    return body.slice(0, 8).map((item, index) => {
      const definitions = (item.meanings ?? []).flatMap((meaning) => meaning.definitions ?? []);
      const meanings = definitions.map((definition) => definition.definition).filter((definition): definition is string => Boolean(definition)).slice(0, 10);
      return { id: `dictionary-${item.word ?? query}-${index}`, language: "en" as const, word: item.word ?? query, reading: null, kana: null, romaji: null, ipa: item.phonetic ?? item.phonetics?.find((phonetic) => phonetic.text)?.text ?? null, pronunciation: item.phonetics?.find((phonetic) => phonetic.audio)?.audio ?? null, partOfSpeech: [...new Set((item.meanings ?? []).map((meaning) => meaning.partOfSpeech).filter((part): part is string => Boolean(part)))].join("、") || null, primaryTranslation: null, englishDefinition: meanings.join("；") || null, meanings, examples: definitions.flatMap((definition) => definition.example ? [{ sentence: definition.example, translation: null }] : []).slice(0, 3), synonyms: [...new Set(definitions.flatMap((definition) => definition.synonyms ?? []))].slice(0, 12), antonyms: [...new Set(definitions.flatMap((definition) => definition.antonyms ?? []))].slice(0, 12), source: "Free Dictionary" as const } satisfies DictionaryEntry;
    });
  });
}

export class EnglishDictionaryService {
  async search(query: string): Promise<DictionarySearchResult> {
    const direct = await fetchEnglish(query);
    const directRanked = rankEntries("en", direct, query);
    if (directRanked.exact.length) return directRanked;
    const forms = englishDictionaryForms(query);
    for (const form of forms) {
      const result = rankEntries("en", await fetchEnglish(form), form, form);
      if (result.exact.length) return { ...result, dictionaryForm: form };
    }
    return directRanked;
  }
}

export async function searchDictionary(language: DictionaryLanguage, query: string) {
  return language === "ja" ? new JapaneseDictionaryService().search(query) : new EnglishDictionaryService().search(query);
}

/** Converts a Chinese search to a candidate, which the route then verifies through a real dictionary lookup. */
export async function translateLookupCandidate(value: string, target: DictionaryLanguage) {
  return translateDictionaryText(value, "zh-TW", target);
}

export async function recordVocabularySearch(userId: string, language: DictionaryLanguage, query: string) {
  const admin = createAdminClient();
  try {
    await admin.from("vocabulary_search_history").upsert({ user_id: userId, language, query: query.trim(), normalized_query: normalizeDictionaryQuery(language, query), searched_at: new Date().toISOString() }, { onConflict: "user_id,language,normalized_query" });
  } catch {
    // Search history should never block a dictionary lookup.
  }
}

export async function getVocabularySearchHistory(userId: string, language: DictionaryLanguage) {
  const admin = createAdminClient();
  try {
    const { data, error } = await admin.from("vocabulary_search_history").select("id,query,searched_at").eq("user_id", userId).eq("language", language).order("searched_at", { ascending: false }).limit(8);
    if (error) throw error;
    return data ?? [];
  } catch {
    return [];
  }
}

export async function clearVocabularySearchHistory(userId: string, language: DictionaryLanguage) {
  const admin = createAdminClient();
  try { await admin.from("vocabulary_search_history").delete().eq("user_id", userId).eq("language", language); } catch { /* optional data */ }
}
