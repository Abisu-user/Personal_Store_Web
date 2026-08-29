#!/usr/bin/env node
/*
 * Imports only openly licensed source datasets into the server-only catalogue.
 * It never runs in a request handler and never deletes user vocabulary_cards.
 *
 * Usage:
 *   npm run vocabulary:import
 *   npm run vocabulary:import -- --language=ja
 *   npm run vocabulary:import -- --dry-run
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import japaneseTraditionalChineseIndex from "../../src/data/vocabulary/openjlpt-tomoshi-zhtw.json" with { type: "json" };

const ROOT = process.cwd();
const BATCH_SIZE = 500;
const LANGUAGES = new Set(["ja", "en", "all"]);
const cliLanguage = (process.argv.find((value) => value.startsWith("--language="))?.split("=")[1] ?? "all").toLowerCase();
const cliDryRun = process.argv.includes("--dry-run");

if (!LANGUAGES.has(cliLanguage)) throw new Error("--language 必須是 ja、en 或 all。");

function loadLocalEnvironment() {
  for (const filename of [".env.local", ".env"]) {
    const fullPath = path.join(/* turbopackIgnore: true */ ROOT, filename);
    if (!existsSync(/* turbopackIgnore: true */ fullPath)) continue;
    for (const line of readFileSync(/* turbopackIgnore: true */ fullPath, "utf8").split(/\r?\n/u)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u);
      if (!match || process.env[match[1]]) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/u, "$2");
      process.env[match[1]] = value;
    }
  }
}

// Vercel injects trusted server-only variables directly. Local CLI runs may
// optionally load .env.local without affecting the server bundle.
if (!process.env.VERCEL) loadLocalEnvironment();
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase renamed the server-only key from SERVICE_ROLE_KEY to SECRET_KEY.
// Keep accepting the older name for existing CI installations.
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("缺少 SUPABASE_URL（或 NEXT_PUBLIC_SUPABASE_URL）及 SUPABASE_SECRET_KEY／SUPABASE_SERVICE_ROLE_KEY；此匯入器只能在受信任的本機／CI 執行。");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const japaneseUrls = Object.fromEntries(["N5", "N4", "N3", "N2", "N1"].map((level) => [level, `https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/${level.toLowerCase()}.json`]));
const englishUrl = "https://huggingface.co/datasets/kknono668/toeic-vocab-tw/resolve/main/data/toeic_vocabulary.json";
const japaneseTraditionalChineseEntries = japaneseTraditionalChineseIndex.entries ?? {};

function importErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error;
    const parts = [
      value.code ? `code: ${value.code}` : null,
      value.message ? `message: ${value.message}` : null,
      value.details ? `details: ${value.details}` : null,
      value.hint ? `hint: ${value.hint}` : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(" | ");
    try { return JSON.stringify(value); } catch { return "未知的結構化錯誤"; }
  }
  return String(error);
}

function throwImportError(label, error) {
  if (error) throw new Error(`${label}: ${importErrorMessage(error)}`);
}

// Keep the catalogue at the same granularity as the UI: each modern
// gojūon sound is independently filterable, while voiced/small variants stay
// with their base sound (が → か, きゃ → き, etc.).
const kanaRows = [
  ["あ", "あぁ"], ["い", "いぃ"], ["う", "うぅゔ"], ["え", "えぇ"], ["お", "おぉ"],
  ["か", "かが"], ["き", "きぎ"], ["く", "くぐ"], ["け", "けげ"], ["こ", "こご"],
  ["さ", "さざ"], ["し", "しじ"], ["す", "すず"], ["せ", "せぜ"], ["そ", "そぞ"],
  ["た", "ただ"], ["ち", "ちぢ"], ["つ", "つづ"], ["て", "てで"], ["と", "とど"],
  ["な", "な"], ["に", "に"], ["ぬ", "ぬ"], ["ね", "ね"], ["の", "の"],
  ["は", "はばぱ"], ["ひ", "ひびぴ"], ["ふ", "ふぶぷ"], ["へ", "へべぺ"], ["ほ", "ほぼぽ"],
  ["ま", "ま"], ["み", "み"], ["む", "む"], ["め", "め"], ["も", "も"],
  ["や", "やゃ"], ["ゆ", "ゆゅ"], ["よ", "よょ"],
  ["ら", "ら"], ["り", "り"], ["る", "る"], ["れ", "れ"], ["ろ", "ろ"],
  ["わ", "わゐゑ"], ["を", "を"], ["ん", "ん"],
];

function normalizeJapanese(value) {
  return String(value ?? "").trim().normalize("NFKC").replace(/[ァ-ヶ]/gu, (character) => String.fromCodePoint(character.codePointAt(0) - 0x60)).replace(/\s+/gu, "");
}

function kanaGroup(value) {
  const normalized = normalizeJapanese(value);
  for (const character of normalized) {
    const match = kanaRows.find(([, characters]) => characters.includes(character));
    if (match) return match[0];
  }
  return "其他";
}

function chunks(values, size = BATCH_SIZE) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "Personal-Vault-vocabulary-importer/1.0 (+https://personal-store-web.vercel.app)" } });
    if (!response.ok) throw new Error(`Dataset download failed: ${response.status} ${response.statusText} (${url})`);
    return { json: await response.json(), lastModified: response.headers.get("last-modified") };
  } finally {
    clearTimeout(timer);
  }
}

async function requireOne(table, filters) {
  let query = admin.from(table).select("*");
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

async function runWithRetries(label, task) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await task(); }
    catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw new Error(`${label} failed after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function beginImport(sourceSlug, collectionSlug, version, dryRun) {
  const source = await requireOne("dictionary_sources", { slug: sourceSlug });
  const collection = await requireOne("vocabulary_collections", { slug: collectionSlug });
  if (dryRun) return { source, collection, job: null };
  const { data: job, error } = await admin.from("vocabulary_dataset_imports").insert({ source_id: source.id, collection_id: collection.id, dataset_version: version, status: "running" }).select("*").single();
  if (error) throw error;
  return { source, collection, job };
}

function validateJapanese(entries) {
  const levels = Object.fromEntries(["N5", "N4", "N3", "N2", "N1"].map((level) => [level, 0]));
  const groups = Object.fromEntries(kanaRows.map(([group]) => [group, 0]));
  // Japanese headwords practically never begin with を or ん.  They remain
  // available as UI filter groups, but treating their absence as a failed
  // source download prevents an otherwise valid OpenJLPT import from running.
  const requiredKanaGroups = Object.keys(groups).filter((group) => !["を", "ん"].includes(group));
  for (const entry of entries) { levels[entry.level] += 1; groups[entry.kanaGroup] += 1; }
  const failures = [
    entries.length < 1_000 ? "總筆數過少" : null,
    ...Object.entries(levels).map(([level, count]) => count < 100 ? `${level} 資料不足` : null),
    ...requiredKanaGroups.map((group) => groups[group] === 0 ? `${group}行沒有資料` : null),
  ].filter(Boolean);
  if (failures.length) throw new Error(`OpenJLPT validation failed: ${failures.join("、")}`);
  return { total: entries.length, levels, kanaGroups: groups };
}

function validateEnglish(entries) {
  const letters = Object.fromEntries("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => [letter, 0]));
  const topicCounts = {};
  for (const entry of entries) {
    const letter = entry.normalizedWord.charAt(0).toUpperCase();
    if (letters[letter] !== undefined) letters[letter] += 1;
    if (entry.topic) topicCounts[entry.topic] = (topicCounts[entry.topic] ?? 0) + 1;
  }
  if (entries.length < 1_000) throw new Error("英文資料集筆數過少，已中止匯入。");
  return { total: entries.length, alphabet: letters, topicCounts };
}

async function importJapanese({ dryRun = false } = {}) {
  console.info("[vocabulary-import] Downloading OpenJLPT N5–N1 datasets…");
  const downloaded = await Promise.all(Object.entries(japaneseUrls).map(async ([level, url]) => ({ level, ...(await fetchJson(url)) })));
  const unique = new Map();
  for (const { level, json } of downloaded) {
    if (!Array.isArray(json)) throw new Error(`OpenJLPT ${level} 不是預期的 JSON 陣列。`);
    for (const raw of json) {
      const word = String(raw.word ?? "").trim();
      const reading = String(raw.reading ?? "").trim() || null;
      const normalizedReading = normalizeJapanese(reading ?? word);
      if (!word || !normalizedReading) continue;
      const sourceEntryId = `${level}:${word}:${normalizedReading}`;
      if (unique.has(sourceEntryId)) continue;
      unique.set(sourceEntryId, { sourceEntryId, word, reading, normalizedReading, normalizedWord: normalizeJapanese(word), level, kanaGroup: kanaGroup(normalizedReading), meanings: Array.isArray(raw.meanings) ? raw.meanings.filter(Boolean).map(String) : [], examples: Array.isArray(raw.examples) ? raw.examples : [] });
    }
  }
  const entries = [...unique.values()].sort((a, b) => a.normalizedReading.localeCompare(b.normalizedReading, "ja"));
  const validation = validateJapanese(entries);
  const datasetVersion = `openjlpt-main-${new Date().toISOString().slice(0, 10)}`;
  console.info("[vocabulary-import] OpenJLPT validated", validation);
  if (dryRun) return validation;
  const { source, collection, job } = await beginImport("openjlpt", "jlpt_common", datasetVersion, dryRun);
  try {
    for (const [batchNumber, batch] of chunks(entries).entries()) {
      // A verified JMdict/Tomoshi hydration enriches the entry with POS and
      // source-aware zh-TW senses. Future OpenJLPT imports may refresh the
      // collection membership, but must never flatten that richer dictionary
      // record back into a single list of English glosses.
      const { data: existingEntries, error: existingError } = await admin
        .from("dictionary_entries")
        .select("source_entry_id,primary_translation,english_definition,part_of_speech,kanji_forms,reading_forms,senses,examples,source_metadata")
        .eq("source_id", source.id)
        .in("source_entry_id", batch.map((entry) => entry.sourceEntryId));
      throwImportError("讀取既有日文詞條", existingError);
      const existingBySourceEntry = new Map((existingEntries ?? []).map((entry) => [entry.source_entry_id, entry]));
      const dictionaryRows = batch.map((entry) => {
        const existing = existingBySourceEntry.get(entry.sourceEntryId);
        const verified = japaneseTraditionalChineseEntries[entry.sourceEntryId] ?? null;
        const verifiedTraditionalChinese = Boolean(verified || existing?.source_metadata?.traditionalChineseVerified);
        return {
          source_id: source.id,
          source_entry_id: entry.sourceEntryId,
          language: "ja",
          word: entry.word,
          reading: entry.reading,
          normalized_word: entry.normalizedWord,
          normalized_reading: entry.normalizedReading,
          primary_translation: verified?.primaryMeaning ?? existing?.primary_translation ?? null,
          english_definition: verified?.englishDefinition ?? (verifiedTraditionalChinese ? existing?.english_definition : entry.meanings.join("；")),
          part_of_speech: verified?.partOfSpeech ?? (verifiedTraditionalChinese ? existing?.part_of_speech : null),
          kanji_forms: verifiedTraditionalChinese ? existing?.kanji_forms : [entry.word],
          reading_forms: verifiedTraditionalChinese ? existing?.reading_forms : [entry.normalizedReading],
          senses: verified?.senses ?? (verifiedTraditionalChinese ? existing?.senses : [{ glosses: entry.meanings }]),
          examples: verifiedTraditionalChinese ? existing?.examples : entry.examples,
          source_metadata: { ...(existing?.source_metadata ?? {}), jlptLevel: entry.level, kanaGroup: entry.kanaGroup, ...(verified ? { traditionalChineseTranslationSource: "tomoshi-jmdict-zhtw", traditionalChineseVerified: true } : {}) },
        };
      });
      const { data: savedEntries, error: dictionaryError } = await runWithRetries("dictionary upsert", () => admin.from("dictionary_entries").upsert(dictionaryRows, { onConflict: "source_id,source_entry_id" }).select("id,source_entry_id,primary_translation"));
      throwImportError("寫入日文字典詞條", dictionaryError);
      const ids = new Map((savedEntries ?? []).map((entry) => [entry.source_entry_id, entry.id]));
      const translations = new Map((savedEntries ?? []).map((entry) => [entry.source_entry_id, entry.primary_translation]));
      if (ids.size !== batch.length) throw new Error("Dictionary upsert 沒有回傳完整的詞條識別碼。");
      const mappingRows = batch.map((entry, index) => ({ collection_id: collection.id, dictionary_entry_id: ids.get(entry.sourceEntryId), level: entry.level, kana_group: entry.kanaGroup, sort_order: batchNumber * BATCH_SIZE + index }));
      const { error: mappingError } = await runWithRetries("collection mapping upsert", () => admin.from("vocabulary_collection_entries").upsert(mappingRows, { onConflict: "collection_id,dictionary_entry_id" }));
      throwImportError("寫入日文單字庫對應", mappingError);
      const catalogRows = batch.map((entry) => {
        const verified = japaneseTraditionalChineseEntries[entry.sourceEntryId] ?? null;
        return { source_id: source.id, source_entry_id: entry.sourceEntryId, dictionary_entry_id: ids.get(entry.sourceEntryId), language: "ja", collection: "jlpt_common", word: entry.word, reading: entry.reading, kana: entry.normalizedReading, romaji: null, ipa: null, meaning_zh_tw: verified?.primaryMeaning || translations.get(entry.sourceEntryId) || entry.meanings.join("；") || "英文釋義待補", meanings_zh_tw: verified?.meanings ?? [], translation_senses_zh_tw: verified?.senses ?? [], english_definition: verified?.englishDefinition ?? (entry.meanings.join("；") || null), part_of_speech: verified?.partOfSpeech ?? null, jlpt_level: entry.level, topics: [], frequency_rank: null, importance: 3, sort_key: entry.normalizedReading, normalized_word: entry.normalizedWord, normalized_reading: entry.normalizedReading, kana_group: entry.kanaGroup, examples: entry.examples, source: verified ? "OpenJLPT + Tomoshi（含 EDRDG／Tatoeba 歸屬）" : "OpenJLPT（含 EDRDG／Tatoeba 歸屬）", license: "CC BY-SA 4.0", dataset_version: datasetVersion, is_active: true, updated_at: new Date().toISOString() };
      });
      const { error: catalogError } = await runWithRetries("catalog upsert", () => admin.from("system_vocabulary").upsert(catalogRows, { onConflict: "source_id,source_entry_id" }));
      throwImportError("寫入日文系統單字庫", catalogError);
      console.info(`[vocabulary-import] Japanese ${Math.min((batchNumber + 1) * BATCH_SIZE, entries.length)}/${entries.length}`);
    }
    const { error: legacyError } = await admin.from("system_vocabulary").update({ is_active: false }).eq("language", "ja").eq("collection", "jlpt_common").is("source_id", null);
    throwImportError("停用舊版日文系統單字", legacyError);
    const { error: completeError } = await admin.from("vocabulary_dataset_imports").update({ status: "completed", item_counts: validation, validation: { valid: true, requiredLevels: ["N5", "N4", "N3", "N2", "N1"], source: "OpenJLPT" }, imported_at: new Date().toISOString() }).eq("id", job.id);
    throwImportError("完成日文資料集匯入紀錄", completeError);
    return validation;
  } catch (error) {
    await admin.from("vocabulary_dataset_imports").update({ status: "failed", error_message: importErrorMessage(error) }).eq("id", job.id);
    throw error;
  }
}

async function importEnglish({ dryRun = false } = {}) {
  console.info("[vocabulary-import] Downloading English–Traditional Chinese dataset…");
  const { json } = await fetchJson(englishUrl);
  if (!Array.isArray(json)) throw new Error("英文資料集不是預期的 JSON 陣列。");
  const unique = new Map();
  for (const raw of json) {
    const word = String(raw.english_word ?? "").trim();
    const normalizedWord = word.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
    if (!word || !/^[a-z]/iu.test(normalizedWord) || unique.has(normalizedWord)) continue;
    unique.set(normalizedWord, { sourceEntryId: `toeic:${normalizedWord}`, word, normalizedWord, meaning: String(raw.chinese_definition ?? "").trim(), importance: Math.max(1, Math.min(5, Number(raw.star_rating) || 3)), topic: String(raw.category ?? "").trim(), partsOfSpeech: Array.isArray(raw.parts_of_speech) ? raw.parts_of_speech.map(String) : [], forms: Array.isArray(raw.word_forms) ? raw.word_forms : [], examples: Array.isArray(raw.examples) ? raw.examples : [], scoreRange: String(raw.toeic_score_range ?? "").trim(), tips: Array.isArray(raw.exam_tips) ? raw.exam_tips : [] });
  }
  const entries = [...unique.values()].sort((a, b) => a.normalizedWord.localeCompare(b.normalizedWord, "en"));
  const validation = validateEnglish(entries);
  const datasetVersion = `toeic-vocab-tw-112.0-${new Date().toISOString().slice(0, 10)}`;
  console.info("[vocabulary-import] English dataset validated", { total: validation.total, topics: Object.keys(validation.topicCounts).length });
  if (dryRun) return validation;
  const { source, collection, job } = await beginImport("toeic-vocab-tw", "toeic_common", datasetVersion, dryRun);
  try {
    for (const [batchNumber, batch] of chunks(entries).entries()) {
      const dictionaryRows = batch.map((entry) => ({ source_id: source.id, source_entry_id: entry.sourceEntryId, language: "en", word: entry.word, reading: null, normalized_word: entry.normalizedWord, normalized_reading: null, primary_translation: entry.meaning || null, english_definition: null, part_of_speech: entry.partsOfSpeech.join(" / ") || null, kanji_forms: [], reading_forms: [], senses: [{ glosses: entry.meaning ? [entry.meaning] : [] }], examples: entry.examples, source_metadata: { wordForms: entry.forms, toeicScoreRange: entry.scoreRange, examTips: entry.tips } }));
      const { data: savedEntries, error: dictionaryError } = await runWithRetries("dictionary upsert", () => admin.from("dictionary_entries").upsert(dictionaryRows, { onConflict: "source_id,source_entry_id" }).select("id,source_entry_id"));
      throwImportError("寫入英文字典詞條", dictionaryError);
      const ids = new Map((savedEntries ?? []).map((entry) => [entry.source_entry_id, entry.id]));
      if (ids.size !== batch.length) throw new Error("Dictionary upsert 沒有回傳完整的英文詞條識別碼。");
      const mappingRows = batch.map((entry, index) => ({ collection_id: collection.id, dictionary_entry_id: ids.get(entry.sourceEntryId), level: null, kana_group: null, topics: entry.topic ? [entry.topic] : [], importance: entry.importance, sort_order: batchNumber * BATCH_SIZE + index }));
      const { error: mappingError } = await runWithRetries("collection mapping upsert", () => admin.from("vocabulary_collection_entries").upsert(mappingRows, { onConflict: "collection_id,dictionary_entry_id" }));
      throwImportError("寫入英文單字庫對應", mappingError);
      const catalogRows = batch.map((entry) => ({ source_id: source.id, source_entry_id: entry.sourceEntryId, dictionary_entry_id: ids.get(entry.sourceEntryId), language: "en", collection: "toeic_common", word: entry.word, reading: null, kana: null, romaji: entry.normalizedWord, ipa: null, meaning_zh_tw: entry.meaning || "中文釋義待補", english_definition: null, part_of_speech: entry.partsOfSpeech.join(" / ") || null, jlpt_level: null, topics: entry.topic ? [entry.topic] : [], frequency_rank: null, importance: entry.importance, sort_key: entry.normalizedWord, normalized_word: entry.normalizedWord, normalized_reading: null, kana_group: null, examples: entry.examples, source: "完整 TOEIC 單字庫（English–Traditional Chinese）", license: "CC BY-SA 4.0", dataset_version: datasetVersion, is_active: true, updated_at: new Date().toISOString() }));
      const { error: catalogError } = await runWithRetries("catalog upsert", () => admin.from("system_vocabulary").upsert(catalogRows, { onConflict: "source_id,source_entry_id" }));
      throwImportError("寫入英文系統單字庫", catalogError);
      console.info(`[vocabulary-import] English ${Math.min((batchNumber + 1) * BATCH_SIZE, entries.length)}/${entries.length}`);
    }
    const { error: legacyError } = await admin.from("system_vocabulary").update({ is_active: false }).eq("language", "en").eq("collection", "toeic_common").is("source_id", null);
    throwImportError("停用舊版英文系統單字", legacyError);
    const { error: completeError } = await admin.from("vocabulary_dataset_imports").update({ status: "completed", item_counts: validation, validation: { valid: true, minimumEntries: 1000, source: "toeic-vocab-tw" }, imported_at: new Date().toISOString() }).eq("id", job.id);
    throwImportError("完成英文資料集匯入紀錄", completeError);
    return validation;
  } catch (error) {
    await admin.from("vocabulary_dataset_imports").update({ status: "failed", error_message: importErrorMessage(error) }).eq("id", job.id);
    throw error;
  }
}

export async function runVocabularyDatasetImport({ language = cliLanguage, dryRun = cliDryRun } = {}) {
  if (!LANGUAGES.has(language)) throw new Error("language 必須是 ja、en 或 all。");
  const report = {};
  if (language === "all" || language === "ja") report.japanese = await importJapanese({ dryRun });
  if (language === "all" || language === "en") report.english = await importEnglish({ dryRun });
  console.info("[vocabulary-import] complete", JSON.stringify(report, null, 2));
  return report;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    await runVocabularyDatasetImport();
  } catch (error) {
    console.error("[vocabulary-import] failed", error);
    process.exitCode = 1;
  }
}
