/*
 * Generates a small, clearly-labelled AI fallback only for Japanese system
 * entries that have no example sentence from any source. It never replaces
 * source-backed or user examples and is safe to rerun.
 */
const ENTRY_BATCH_SIZE = 16;
const INSERT_BATCH_SIZE = 180;
const CONCURRENCY = 3;

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getAllEntries(admin, sourceId) {
  const entries = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("dictionary_entries")
      .select("id,word,reading,primary_translation,part_of_speech,jlpt_level")
      .eq("source_id", sourceId)
      .eq("language", "ja")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    entries.push(...(data ?? []));
    if (!data || data.length < 1000) return entries;
  }
}

async function getEntriesWithExamples(admin, entryIds) {
  const result = new Set();
  for (const batch of chunks(entryIds, 140)) {
    const { data, error } = await admin
      .from("vocabulary_examples")
      .select("dictionary_entry_id")
      .is("card_id", null)
      .in("dictionary_entry_id", batch);
    if (error) throw error;
    for (const row of data ?? []) result.add(row.dictionary_entry_id);
  }
  return result;
}

async function requestExamples(entries) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");
  const model = process.env.OPENAI_VOCABULARY_MODEL || "gpt-4.1-mini";
  const promptEntries = entries.map((entry, index) => ({
    key: String(index),
    word: entry.word,
    reading: entry.reading || null,
    meaningZhTw: entry.primary_translation || null,
    partOfSpeech: entry.part_of_speech || null,
    level: entry.jlpt_level || "unknown",
  }));
  const instruction = `你是日文教材編輯。請為每個單字產生兩個自然、短、適合台灣學習者的日文例句與繁體中文翻譯。必須保持詞性和指定核心意思；沒有足夠資訊時寧可跳過該項目。不要使用英文字、Markdown 或讀音標記。回傳純 JSON：{"entries":[{"key":"0","examples":[{"sentence":"...","translationZhTw":"..."}]}]}。例句不可與其他項目重複。`;
  const body = { model, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: instruction }, { role: "user", content: JSON.stringify({ entries: promptEntries }) }] };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) throw new Error(`AI_UPSTREAM_${response.status}`);
        lastError = new Error(`AI_UPSTREAM_${response.status}`);
      } else {
        const payload = JSON.parse(text);
        const content = payload?.choices?.[0]?.message?.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : null;
        if (!Array.isArray(parsed?.entries)) throw new Error("AI_INVALID_RESPONSE");
        return parsed.entries;
      }
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /^AI_UPSTREAM_4(?!29)/.test(error.message)) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await pause((attempt + 1) * 1500);
  }
  throw lastError ?? new Error("AI_UNKNOWN_ERROR");
}

async function mapWithConcurrency(values, callback) {
  const results = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await callback(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, worker));
  return results;
}

export async function runAiMissingExamplesImport({ admin } = {}) {
  if (!admin) throw new Error("缺少受信任的 Supabase 管理用戶端。");
  const { data: source, error: sourceError } = await admin.from("dictionary_sources").select("id").eq("slug", "openjlpt").single();
  if (sourceError || !source) throw sourceError ?? new Error("找不到 OpenJLPT 字典來源。");
  const entries = await getAllEntries(admin, source.id);
  const withExamples = await getEntriesWithExamples(admin, entries.map((entry) => entry.id));
  const missing = entries.filter((entry) => !withExamples.has(entry.id));
  const report = { candidates: missing.length, generatedEntries: 0, inserted: 0, failedBatches: 0, remaining: 0 };
  if (!missing.length) return report;

  const batches = chunks(missing, ENTRY_BATCH_SIZE);
  const generated = await mapWithConcurrency(batches, async (batch) => {
    try { return { batch, entries: await requestExamples(batch) }; }
    catch (error) {
      report.failedBatches += 1;
      console.warn("[vocabulary-ai-examples] batch failed", { message: error instanceof Error ? error.message : String(error), words: batch.map((entry) => entry.word) });
      return { batch, entries: [] };
    }
  });

  const rows = [];
  for (const { batch, entries: responseEntries } of generated) {
    for (const generatedEntry of responseEntries) {
      const entry = batch[Number(generatedEntry?.key)];
      if (!entry || !Array.isArray(generatedEntry?.examples)) continue;
      const unique = new Set();
      for (const [index, example] of generatedEntry.examples.entries()) {
        const sentence = String(example?.sentence ?? "").trim();
        const translationZhTw = String(example?.translationZhTw ?? "").trim();
        if (!sentence || !translationZhTw || unique.has(sentence)) continue;
        unique.add(sentence);
        rows.push({ card_id: null, dictionary_entry_id: entry.id, sense_id: null, language: "ja", sentence, reading: null,
          translation: translationZhTw, translation_zh_tw: translationZhTw, difficulty_level: entry.jlpt_level || "unknown",
          source: "AI 產生例句（未校對）", source_id: `ai-system-example-v1:${entry.id}:${index + 1}`,
          // The existing database constraint reserves `ai` for personal-card
          // drafts.  These rows are catalog-level supplements: retain the
          // explicit unverified AI source, while using the catalog-safe shape.
          is_verified: false, example_kind: "system", is_favorite: false });
      }
      if (unique.size) report.generatedEntries += 1;
    }
  }
  for (const batch of chunks(rows, INSERT_BATCH_SIZE)) {
    const { error } = await admin.from("vocabulary_examples").insert(batch);
    if (error) throw error;
    report.inserted += batch.length;
  }
  report.remaining = Math.max(0, report.candidates - report.generatedEntries);
  console.info("[vocabulary-ai-examples] complete", JSON.stringify(report));
  return report;
}
