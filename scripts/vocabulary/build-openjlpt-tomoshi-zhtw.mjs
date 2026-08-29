import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import initSqlJs from "sql.js";
import { buildVerifiedJapaneseTranslation, normalizeJapanese } from "./tomoshi-zhtw.mjs";

const ROOT = process.cwd();
const OUTPUT = join(ROOT, "src", "data", "vocabulary", "openjlpt-tomoshi-zhtw.json");
const RELEASE_URL = "https://github.com/tomoshi-app/tomoshi-dict-data/releases/download/v2026-08-12/tomoshi-dict-open.db.zst";
const DB_PATH = process.argv.find((value) => value.startsWith("--db="))?.slice(5) || join(tmpdir(), basename(RELEASE_URL));
const japaneseUrls = Object.fromEntries(["N5", "N4", "N3", "N2", "N1"].map((level) => [level, `https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/${level.toLowerCase()}.json`]));

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Personal-Vault-vocabulary-importer/1.0 (+https://personal-store-web.vercel.app)" } });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchJson(url) {
  return JSON.parse((await fetchBytes(url)).toString("utf8"));
}

function chunk(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function sqlStringList(values) {
  return values.map((value) => `'${String(value).replace(/'/gu, "''")}'`).join(",");
}

function rowsFromSql(result) {
  if (!result?.[0]) return [];
  return result[0].values.map((row) => Object.fromEntries(result[0].columns.map((column, index) => [column, row[index]])));
}

function rankCandidate(target, candidate) {
  const forms = candidate.forms.map(normalizeJapanese);
  const word = normalizeJapanese(target.word);
  const reading = normalizeJapanese(target.reading || target.word);
  return (forms.includes(word) ? 100 : 0) + (forms.includes(reading) ? 90 : 0) + (candidate.is_common ? 5 : 0);
}

function indexCandidatesByForm(candidates) {
  const index = new Map();
  for (const candidate of candidates) {
    for (const form of candidate.forms) {
      const normalized = normalizeJapanese(form);
      if (!normalized) continue;
      const values = index.get(normalized) ?? [];
      values.push(candidate);
      index.set(normalized, values);
    }
  }
  return index;
}

function bestCandidateFor(entry, candidatesByForm) {
  const candidates = [...new Set([entry.word, entry.reading].filter(Boolean).map(normalizeJapanese).flatMap((form) => candidatesByForm.get(form) ?? []))];
  return candidates.map((candidate) => ({ candidate, score: rankCandidate(entry, candidate) })).filter((item) => item.score >= 190).sort((left, right) => right.score - left.score)[0]?.candidate;
}

function candidatesFor(db, entries) {
  const tokens = [...new Set(entries.flatMap((entry) => [entry.word, entry.reading]).filter(Boolean))];
  const found = new Map();
  for (const group of chunk(tokens, 400)) {
    const rows = rowsFromSql(db.exec(`select distinct f.entry_id, e.data as entry_data, z.data as definition_data, e.is_common from forms f join entries e on e.id = f.entry_id join zh_defs_zhtw z on z.entry_id = f.entry_id where f.text in (${sqlStringList(group)})`));
    for (const row of rows) found.set(row.entry_id, row);
  }
  const forms = new Map([...found.keys()].map((id) => [id, []]));
  for (const group of chunk([...found.keys()], 400)) {
    for (const row of rowsFromSql(db.exec(`select entry_id, text from forms where entry_id in (${sqlStringList(group)})`))) forms.get(row.entry_id)?.push(row.text);
  }
  return [...found.entries()].map(([id, row]) => ({ id, ...row, forms: forms.get(id) ?? [] }));
}

async function getOpenJlptEntries() {
  const rows = [];
  for (const [level, url] of Object.entries(japaneseUrls)) {
    const items = await fetchJson(url);
    for (const raw of items) {
      const word = String(raw.word ?? "").trim();
      const reading = String(raw.reading ?? "").trim() || word;
      if (!word || !reading) continue;
      rows.push({ sourceEntryId: `${level}:${word}:${normalizeJapanese(reading)}`, word, reading });
    }
  }
  return [...new Map(rows.map((entry) => [entry.sourceEntryId, entry])).values()];
}

async function getTomoshiBytes() {
  return existsSync(DB_PATH) ? readFileSync(DB_PATH) : fetchBytes(RELEASE_URL);
}

async function main() {
  const entries = await getOpenJlptEntries();
  const SQL = await initSqlJs();
  const db = new SQL.Database(zstdDecompressSync(await getTomoshiBytes()));
  const candidates = candidatesFor(db, entries);
  const candidatesByForm = indexCandidatesByForm(candidates);
  const translations = {};
  for (const entry of entries) {
    const match = bestCandidateFor(entry, candidatesByForm);
    if (!match) continue;
    const translation = buildVerifiedJapaneseTranslation({ tomoshiDefinition: match.definition_data, tomoshiEntry: match.entry_data });
    if (!translation.primaryMeaning) continue;
    translations[entry.sourceEntryId] = translation;
  }
  db.close();
  const output = {
    source: "Tomoshi JMdict Traditional Chinese definitions",
    sourceUrl: "https://github.com/tomoshi-app/tomoshi-dict-data",
    license: "CC BY-SA 4.0",
    attribution: "EDRDG JMdict / Tomoshi dictionary data; generated for Personal Vault from OpenJLPT vocabulary identifiers.",
    sourceVersion: "v2026-08-12",
    generatedAt: new Date().toISOString(),
    entries: translations,
  };
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(output)}\n`, "utf8");
  console.info("[tomoshi-index] complete", { OpenJLPT: entries.length, translated: Object.keys(translations).length, unmatched: entries.length - Object.keys(translations).length, output: OUTPUT });
}

main().catch((error) => {
  console.error("[tomoshi-index] failed", error);
  process.exitCode = 1;
});
