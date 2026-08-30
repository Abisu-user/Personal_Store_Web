#!/usr/bin/env node
/*
 * Imports only source-backed example sentences into the system dictionary.
 * It never changes user examples or manually reviewed system examples and can
 * be safely re-run after a source dataset refresh.
 */
const BATCH_SIZE = 240;

const openJlptUrls = Object.fromEntries(["N5", "N4", "N3", "N2", "N1"].map((level) => [level, `https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/${level.toLowerCase()}.json`]));
const toeicUrl = "https://huggingface.co/datasets/kknono668/toeic-vocab-tw/resolve/main/data/toeic_vocabulary.json";

function normalizeJapanese(value) {
  return String(value ?? "").trim().normalize("NFKC").replace(/[ァ-ヶ]/gu, (character) => String.fromCodePoint(character.codePointAt(0) - 0x60)).replace(/\s+/gu, "");
}
function normalizeEnglish(value) {
  return String(value ?? "").trim().normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}
function chunks(values, size = BATCH_SIZE) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}
async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "Personal-Vault-vocabulary-example-importer/1.0 (+https://personal-store-web.vercel.app)" } });
    if (!response.ok) throw new Error(`資料來源下載失敗：${response.status} ${response.statusText}`);
    return response.json();
  } finally { clearTimeout(timeout); }
}
async function sourceId(admin, slug) {
  const { data, error } = await admin.from("dictionary_sources").select("id").eq("slug", slug).single();
  if (error || !data) throw error ?? new Error(`找不到字典來源：${slug}`);
  return data.id;
}
async function entryIdsBySourceEntry(admin, sourceId, sourceEntryIds) {
  const ids = new Map();
  for (const batch of chunks(sourceEntryIds, 140)) {
    const { data, error } = await admin.from("dictionary_entries").select("id,source_entry_id").eq("source_id", sourceId).in("source_entry_id", batch);
    if (error) throw error;
    for (const entry of data ?? []) ids.set(entry.source_entry_id, entry.id);
  }
  return ids;
}
async function existingSentenceKeys(admin, entryIds) {
  const result = new Set();
  for (const batch of chunks(entryIds, 140)) {
    const { data, error } = await admin.from("vocabulary_examples").select("dictionary_entry_id,sentence").is("card_id", null).in("dictionary_entry_id", batch);
    if (error) throw error;
    for (const row of data ?? []) result.add(`${row.dictionary_entry_id}\u0000${row.sentence}`);
  }
  return result;
}
async function insertNewExamples(admin, rows, report, dryRun) {
  if (!rows.length || dryRun) return;
  for (const batch of chunks(rows)) {
    const { error } = await admin.from("vocabulary_examples").insert(batch);
    if (error) throw error;
    report.inserted += batch.length;
  }
}

async function importJapanese(admin, dryRun) {
  const downloaded = await Promise.all(Object.entries(openJlptUrls).map(async ([level, url]) => ({ level, entries: await fetchJson(url) })));
  const indexed = downloaded.flatMap(({ level, entries }) => (Array.isArray(entries) ? entries : []).map((entry) => {
    const word = String(entry.word ?? "").trim();
    return { level, entry, sourceEntryId: `${level}:${word}:${normalizeJapanese(entry.reading || word)}` };
  })).filter(({ entry }) => Array.isArray(entry.examples) && entry.examples.length);
  const source = await sourceId(admin, "openjlpt");
  const ids = await entryIdsBySourceEntry(admin, source, indexed.map((item) => item.sourceEntryId));
  const existing = await existingSentenceKeys(admin, [...ids.values()]);
  const report = { language: "ja", wordsWithSourceExamples: indexed.length, sourceExamples: 0, inserted: 0, skippedExisting: 0, missingCatalogEntries: indexed.filter((item) => !ids.has(item.sourceEntryId)).length };
  const rows = [];
  for (const { level, entry, sourceEntryId } of indexed) {
    const dictionaryEntryId = ids.get(sourceEntryId);
    if (!dictionaryEntryId) continue;
    for (const [index, raw] of entry.examples.entries()) {
      const sentence = String(raw?.ja ?? "").trim();
      if (!sentence) continue;
      report.sourceExamples += 1;
      if (existing.has(`${dictionaryEntryId}\u0000${sentence}`)) { report.skippedExisting += 1; continue; }
      rows.push({ card_id: null, dictionary_entry_id: dictionaryEntryId, sense_id: null, language: "ja", sentence, reading: null,
        // The source only provides English here. Do not label it as zh-TW.
        translation: String(raw?.en ?? "").trim() || null, translation_zh_tw: null, difficulty_level: level,
        source: "OpenJLPT／Tatoeba", source_id: `${sourceEntryId}:example:${index + 1}`, is_verified: true, example_kind: "system", is_favorite: false });
    }
  }
  await insertNewExamples(admin, rows, report, dryRun);
  return report;
}

async function importEnglish(admin, dryRun) {
  const dataset = await fetchJson(toeicUrl);
  if (!Array.isArray(dataset)) throw new Error("TOEIC 資料來源格式不正確。");
  const indexed = dataset.map((entry) => ({ entry, sourceEntryId: `toeic:${normalizeEnglish(entry.english_word)}` })).filter(({ entry }) => Array.isArray(entry.examples) && entry.examples.length);
  const source = await sourceId(admin, "toeic-vocab-tw");
  const ids = await entryIdsBySourceEntry(admin, source, indexed.map((item) => item.sourceEntryId));
  const existing = await existingSentenceKeys(admin, [...ids.values()]);
  const report = { language: "en", wordsWithSourceExamples: indexed.length, sourceExamples: 0, inserted: 0, skippedExisting: 0, missingCatalogEntries: indexed.filter((item) => !ids.has(item.sourceEntryId)).length };
  const rows = [];
  for (const { entry, sourceEntryId } of indexed) {
    const dictionaryEntryId = ids.get(sourceEntryId);
    if (!dictionaryEntryId) continue;
    for (const [index, raw] of entry.examples.entries()) {
      const sentence = String(raw?.english ?? "").trim();
      if (!sentence) continue;
      report.sourceExamples += 1;
      if (existing.has(`${dictionaryEntryId}\u0000${sentence}`)) { report.skippedExisting += 1; continue; }
      const translation = String(raw?.chinese ?? "").trim() || null;
      rows.push({ card_id: null, dictionary_entry_id: dictionaryEntryId, sense_id: null, language: "en", sentence, reading: null,
        translation, translation_zh_tw: translation, difficulty_level: "unknown", source: "TOEIC Vocabulary TW", source_id: `${sourceEntryId}:example:${index + 1}`,
        is_verified: true, example_kind: "system", is_favorite: false });
    }
  }
  await insertNewExamples(admin, rows, report, dryRun);
  return report;
}

export async function runSystemExamplesImport({ admin, language = "all", dryRun = false } = {}) {
  if (!admin) throw new Error("缺少受信任的 Supabase 管理用戶端。");
  if (!new Set(["all", "ja", "en"]).has(language)) throw new Error("language 必須是 ja、en 或 all。");
  const report = { dryRun, japanese: null, english: null };
  if (language === "all" || language === "ja") report.japanese = await importJapanese(admin, dryRun);
  if (language === "all" || language === "en") report.english = await importEnglish(admin, dryRun);
  console.info("[vocabulary-examples] complete", JSON.stringify(report, null, 2));
  return report;
}
