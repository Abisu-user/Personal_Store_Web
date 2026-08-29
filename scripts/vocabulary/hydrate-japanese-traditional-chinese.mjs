import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import initSqlJs from "sql.js";
import { buildVerifiedJapaneseTranslation, normalizeJapanese } from "./tomoshi-zhtw.mjs";

const ROOT = process.cwd();
const RELEASE_URL = "https://github.com/tomoshi-app/tomoshi-dict-data/releases/download/v2026-08-12/tomoshi-dict-open.db.zst";
const DB_PATH = process.argv.find((value) => value.startsWith("--db="))?.slice(5) || join(tmpdir(), basename(RELEASE_URL));
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 250;

function loadLocalEnvironment() {
  for (const filename of [".env.local", ".env"]) {
    const fullPath = join(ROOT, filename);
    if (!existsSync(fullPath)) continue;
    for (const line of readFileSync(fullPath, "utf8").split(/\r?\n/u)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/u, "$2");
    }
  }
}

if (!process.env.VERCEL) loadLocalEnvironment();
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("缺少 Supabase server-only 環境變數，無法執行可信賴的繁中詞義匯入。");
if (typeof zstdDecompressSync !== "function") throw new Error("此匯入器需要 Node.js 22+ 的 zstdDecompressSync。");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function fetchFile(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Personal-Vault-vocabulary-importer/1.0 (+https://personal-store-web.vercel.app)" } });
  if (!response.ok) throw new Error(`Tomoshi dictionary download failed: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

async function getDatabaseBytes() {
  if (existsSync(DB_PATH)) return readFileSync(DB_PATH);
  console.info("[tomoshi-hydrate] Downloading Tomoshi open dictionary…");
  return fetchFile(RELEASE_URL);
}

async function listJapaneseEntries() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("dictionary_entries")
      .select("id,word,reading,normalized_word,normalized_reading")
      .eq("language", "ja")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function chunk(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function sqlStringList(values) {
  return values.map((value) => `'${String(value).replace(/'/gu, "''")}'`).join(",");
}

function rowsFromSql(result) {
  if (!result?.[0]) return [];
  const { columns, values } = result[0];
  return values.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

function rankCandidate(target, candidate) {
  const forms = candidate.forms.map(normalizeJapanese);
  const word = normalizeJapanese(target.word);
  const reading = normalizeJapanese(target.reading || target.normalized_reading || target.word);
  const hasWord = forms.includes(word);
  const hasReading = forms.includes(reading);
  return (hasWord ? 100 : 0) + (hasReading ? 90 : 0) + (candidate.isCommon ? 5 : 0);
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
  const keys = [entry.word, entry.reading, entry.normalized_word, entry.normalized_reading].filter(Boolean).map(normalizeJapanese);
  const candidates = [...new Set(keys.flatMap((key) => candidatesByForm.get(key) ?? []))];
  return candidates
    .map((candidate) => ({ candidate, score: rankCandidate(entry, candidate) }))
    .filter((item) => item.score >= 190)
    .sort((left, right) => right.score - left.score)[0]?.candidate;
}

function findCandidates(db, entries) {
  const tokens = [...new Set(entries.flatMap((entry) => [entry.word, entry.reading, entry.normalized_word, entry.normalized_reading]).filter(Boolean))];
  const matched = new Map();
  for (const group of chunk(tokens, 400)) {
    const rows = rowsFromSql(db.exec(`select distinct f.entry_id, e.data as entry_data, z.data as definition_data, e.is_common from forms f join entries e on e.id = f.entry_id join zh_defs_zhtw z on z.entry_id = f.entry_id where f.text in (${sqlStringList(group)})`));
    for (const row of rows) matched.set(row.entry_id, row);
  }
  const candidateIds = [...matched.keys()];
  const formsByEntry = new Map(candidateIds.map((id) => [id, []]));
  for (const group of chunk(candidateIds, 400)) {
    const rows = rowsFromSql(db.exec(`select entry_id, text from forms where entry_id in (${sqlStringList(group)})`));
    for (const row of rows) formsByEntry.get(row.entry_id)?.push(row.text);
  }
  return [...matched.entries()].map(([id, row]) => ({ id, ...row, forms: formsByEntry.get(id) ?? [] }));
}

export async function runJapaneseTraditionalChineseHydration({ dryRun = DRY_RUN } = {}) {
  const importedEntries = await listJapaneseEntries();
  if (!importedEntries.length) throw new Error("找不到可同步的日文系統詞條。請先匯入 OpenJLPT 資料集。");
  console.info(`[tomoshi-hydrate] Loading ${importedEntries.length} Japanese entries…`);
  const compressed = await getDatabaseBytes();
  const SQL = await initSqlJs();
  const db = new SQL.Database(zstdDecompressSync(compressed));
  const candidates = findCandidates(db, importedEntries);
  const candidatesByForm = indexCandidatesByForm(candidates);
  const updates = [];
  for (const entry of importedEntries) {
    const matched = bestCandidateFor(entry, candidatesByForm);
    if (!matched) continue;
    const translated = buildVerifiedJapaneseTranslation({ tomoshiDefinition: matched.definition_data, tomoshiEntry: matched.entry_data });
    if (!translated.primaryMeaning || !translated.meanings.length) continue;
    updates.push({
      dictionary_entry_id: entry.id,
      normalized_word: normalizeJapanese(entry.word),
      primary_meaning: translated.primaryMeaning,
      meanings_json: translated.meanings,
      senses: translated.senses,
      english_definition: translated.englishDefinition,
      part_of_speech: translated.partOfSpeech,
    });
  }
  db.close();
  const report = { sourceEntries: importedEntries.length, tomoshiCandidates: candidates.length, translated: updates.length, unmatched: importedEntries.length - updates.length };
  console.info("[tomoshi-hydrate] Match report", report);
  if (dryRun) return report;
  for (const [index, group] of chunk(updates, BATCH_SIZE).entries()) {
    const { data, error } = await admin.rpc("apply_verified_japanese_translation_batch", { p_updates: group });
    if (error) throw error;
    console.info(`[tomoshi-hydrate] Saved ${Math.min((index + 1) * BATCH_SIZE, updates.length)}/${updates.length} catalog rows (${data ?? 0} changed in batch).`);
  }
  return report;
}

const isCli = process.argv[1]?.endsWith("hydrate-japanese-traditional-chinese.mjs");
if (isCli) {
  runJapaneseTraditionalChineseHydration().then((report) => console.info("[tomoshi-hydrate] complete", report)).catch((error) => {
    console.error("[tomoshi-hydrate] failed", error);
    process.exitCode = 1;
  });
}
