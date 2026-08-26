import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type DictionaryLanguage = "ja" | "en";
export type LookupInputLanguage = "zh" | DictionaryLanguage;
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
};

const CACHE_HOURS = 12;
const normalize = (value: string) => value.trim().toLocaleLowerCase();
const translationCache = new Map<string, { expiresAt: number; value: string | null }>();

function withTimeout(url: string, init: RequestInit = {}, ms = 7_500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

async function cached<T>(provider: "japanese_dictionary" | "english_dictionary", language: DictionaryLanguage, query: string, loader: () => Promise<T>): Promise<T> {
  const normalizedQuery = normalize(query);
  const admin = createAdminClient();
  try {
    const { data } = await admin.from("vocabulary_lookup_cache").select("payload,expires_at").eq("provider", provider).eq("language", language).eq("normalized_query", normalizedQuery).maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) return data.payload as T;
  } catch {
    // The migration may not be applied yet. Dictionary lookup remains available.
  }
  const payload = await loader();
  try {
    await admin.from("vocabulary_lookup_cache").upsert({ provider, language, normalized_query: normalizedQuery, payload, expires_at: new Date(Date.now() + CACHE_HOURS * 60 * 60 * 1000).toISOString() }, { onConflict: "provider,language,normalized_query" });
  } catch {
    // Caching is an optimization, never a dependency for lookups.
  }
  return payload;
}

function isNonLatinQuery(value: string) { return /[\u3400-\u9fff]/.test(value); }

export function detectLookupInputLanguage(value: string): LookupInputLanguage {
  if (/[\u3040-\u30ff]/.test(value)) return "ja";
  if (/[\u3400-\u9fff]/.test(value)) return "zh";
  return "en";
}

export async function translateDictionaryText(value: string, source: "zh-TW" | "ja" | "en", target: "zh-TW" | "ja" | "en") {
  if (!value.trim() || source === target) return value.trim() || null;
  const key = `${source}:${target}:${normalize(value)}`;
  const cachedValue = translationCache.get(key);
  if (cachedValue && cachedValue.expiresAt > Date.now()) return cachedValue.value;
  try {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", source);
    url.searchParams.set("tl", target);
    url.searchParams.append("dt", "t");
    url.searchParams.set("q", value);
    const response = await withTimeout(url.toString(), { headers: { Accept: "application/json", "User-Agent": "Personal-Vault/1.0 vocabulary translation" } });
    if (!response.ok) throw new Error(`Translation upstream ${response.status}`);
    const body = await response.json() as Array<Array<Array<string | null>>>;
    const translated = body[0]?.map((part) => part[0] ?? "").join("").trim() || null;
    translationCache.set(key, { value: translated, expiresAt: Date.now() + 30 * 60 * 1000 });
    return translated;
  } catch {
    translationCache.set(key, { value: null, expiresAt: Date.now() + 2 * 60 * 1000 });
    return null;
  }
}

export class JapaneseDictionaryService {
  async search(query: string): Promise<DictionaryEntry[]> {
    return cached("japanese_dictionary", "ja", query, async () => {
      const response = await withTimeout(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(query)}`, { headers: { Accept: "application/json", "User-Agent": "Personal-Vault/1.0 dictionary lookup" } });
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`Japanese dictionary upstream ${response.status}`);
      const body = await response.json() as { data?: Array<{ slug?: string; japanese?: Array<{ word?: string; reading?: string }>; senses?: Array<{ english_definitions?: string[]; parts_of_speech?: string[] }> }> };
      return (body.data ?? []).slice(0, 8).map((item, index) => {
        const spelling = item.japanese?.[0] ?? {};
        const meanings = [...new Set((item.senses ?? []).flatMap((sense) => sense.english_definitions ?? []))].slice(0, 10);
        const parts = [...new Set((item.senses ?? []).flatMap((sense) => sense.parts_of_speech ?? []).filter((part) => !part.startsWith("Wikipedia")))];
        return { id: `jisho-${index}-${item.slug ?? spelling.word ?? spelling.reading ?? query}`, language: "ja", word: spelling.word ?? spelling.reading ?? query, reading: spelling.reading ?? null, kana: spelling.reading ?? null, romaji: null, ipa: null, pronunciation: null, partOfSpeech: parts.join("、") || null, primaryTranslation: null, englishDefinition: meanings.join("；") || null, meanings, examples: [], synonyms: [], antonyms: [], source: "Jisho" } satisfies DictionaryEntry;
      });
    });
  }
}

export class EnglishDictionaryService {
  async search(query: string): Promise<DictionaryEntry[]> {
    if (isNonLatinQuery(query) || !/[a-z]/i.test(query)) return [];
    return cached("english_dictionary", "en", query, async () => {
      const response = await withTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`, { headers: { Accept: "application/json", "User-Agent": "Personal-Vault/1.0 dictionary lookup" } });
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`English dictionary upstream ${response.status}`);
      const body = await response.json() as Array<{ word?: string; phonetic?: string; phonetics?: Array<{ text?: string; audio?: string }>; meanings?: Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string; example?: string; synonyms?: string[]; antonyms?: string[] }> }> }>;
      return body.slice(0, 5).map((item, index) => {
        const definitions = (item.meanings ?? []).flatMap((meaning) => meaning.definitions ?? []);
        const meanings = definitions.map((definition) => definition.definition).filter((definition): definition is string => Boolean(definition)).slice(0, 10);
        return { id: `dictionary-${index}-${item.word ?? query}`, language: "en", word: item.word ?? query, reading: null, kana: null, romaji: null, ipa: item.phonetic ?? item.phonetics?.find((phonetic) => phonetic.text)?.text ?? null, pronunciation: item.phonetics?.find((phonetic) => phonetic.audio)?.audio ?? null, partOfSpeech: [...new Set((item.meanings ?? []).map((meaning) => meaning.partOfSpeech).filter((part): part is string => Boolean(part)))].join("、") || null, primaryTranslation: null, englishDefinition: meanings.join("；") || null, meanings, examples: definitions.flatMap((definition) => definition.example ? [{ sentence: definition.example, translation: null }] : []).slice(0, 3), synonyms: [...new Set(definitions.flatMap((definition) => definition.synonyms ?? []))].slice(0, 12), antonyms: [...new Set(definitions.flatMap((definition) => definition.antonyms ?? []))].slice(0, 12), source: "Free Dictionary" } satisfies DictionaryEntry;
      });
    });
  }
}

export async function searchDictionary(language: DictionaryLanguage, query: string) {
  return language === "ja" ? new JapaneseDictionaryService().search(query) : new EnglishDictionaryService().search(query);
}

export async function recordVocabularySearch(userId: string, language: DictionaryLanguage, query: string) {
  const admin = createAdminClient();
  try {
    await admin.from("vocabulary_search_history").upsert({ user_id: userId, language, query: query.trim(), normalized_query: normalize(query), searched_at: new Date().toISOString() }, { onConflict: "user_id,language,normalized_query" });
  } catch {
    // History depends on the optional migration and must not prevent a lookup.
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
