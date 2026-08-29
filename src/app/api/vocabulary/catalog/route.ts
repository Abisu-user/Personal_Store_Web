import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyVerifiedJapaneseSystemTranslation } from "@/lib/vocabulary/system-japanese-translations";

export const dynamic = "force-dynamic";

const wordId = z.string().uuid();
const actionSchema = z.object({
  action: z.enum(["favorite", "unfavorite", "learn", "batchLearn"]),
  ids: z.array(wordId).min(1).max(100),
});

const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status });
const safeSearch = (value: string) => value.replace(/[%,().]/g, " ").trim().slice(0, 80);
function catalogCard(row: Record<string, unknown>, user: Record<string, unknown> | undefined) {
  const status = user?.learning_status as string | undefined;
  return {
    id: row.id,
    language: row.language,
    collection: row.collection,
    word: row.word,
    reading: row.reading,
    kana: row.kana,
    romaji: row.romaji,
    ipa: row.ipa,
    meaningZhTw: row.meaning_zh_tw,
    meaningsZhTw: row.meanings_zh_tw ?? [],
    englishDefinition: row.english_definition,
    partOfSpeech: row.part_of_speech,
    jlptLevel: row.jlpt_level,
    topics: row.topics ?? [],
    importance: row.importance,
    source: row.source,
    license: row.license,
    datasetVersion: row.dataset_version,
    userState: {
      favorite: Boolean(user?.is_favorite),
      learning: status === "learning" || status === "reviewing" || status === "mastered",
      mastered: status === "mastered",
      cardId: user?.id ?? null,
    },
  };
}

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const params = request.nextUrl.searchParams;
  const mode = params.get("mode");
  const language = params.get("language") === "en" ? "en" : "ja";
  const collection = language === "ja" ? "jlpt_common" : "toeic_common";
  const page = Math.max(1, Math.min(500, Number(params.get("page")) || 1));
  const limit = Math.max(5, Math.min(30, Number(params.get("limit")) || 12));
  const level = (params.get("level") || "").trim().toUpperCase();
  const topic = params.get("topic");
  const startsWith = params.get("startsWith");
  const search = safeSearch(params.get("q") || "");

  try {
    const admin = createAdminClient();
    if (mode === "stats") {
      const { data, error } = await admin
        .from("vocabulary_dataset_imports")
        .select("collection_id,item_counts,imported_at,collection:vocabulary_collections(slug,language)")
        .eq("status", "completed")
        .order("imported_at", { ascending: false });
      if (error) throw error;
      const collections: Record<string, { language: string; counts: Record<string, unknown>; importedAt: string | null }> = {};
      for (const row of data ?? []) {
        const collection = Array.isArray(row.collection) ? row.collection[0] : row.collection;
        if (!collection || collections[collection.slug]) continue;
        collections[collection.slug] = { language: collection.language, counts: row.item_counts ?? {}, importedAt: row.imported_at };
      }
      return NextResponse.json({ collections }, { headers: { "Cache-Control": "private, max-age=300" } });
    }
    const applyBaseFilters = (query: ReturnType<typeof admin.from>) => {
      let filtered = query.select("*", { count: "exact" }).eq("language", language).eq("collection", collection).eq("is_active", true);
      if (topic) filtered = filtered.contains("topics", [topic]);
      if (startsWith) filtered = language === "ja" ? filtered.eq("kana_group", safeSearch(startsWith)) : filtered.ilike("sort_key", `${safeSearch(startsWith)}%`);
      if (search) filtered = filtered.or(`word.ilike.%${search}%,reading.ilike.%${search}%,meaning_zh_tw.ilike.%${search}%,romaji.ilike.%${search}%`);
      return filtered;
    };
    const validLevel = language === "ja" && ["N5", "N4", "N3", "N2", "N1"].includes(level);
    let query = applyBaseFilters(admin.from("system_vocabulary"));
    if (validLevel) query = query.eq("jlpt_level", level);
    const initial = await query.order("sort_key", { ascending: true }).range((page - 1) * limit, page * limit - 1);
    let { data, count } = initial;
    if (initial.error) throw initial.error;
    // Older manually-applied catalog migrations can contain level values with
    // inconsistent casing or whitespace. Fall back to a normalized comparison
    // so a valid JLPT filter never looks empty to the user.
    if (validLevel && !data?.length) {
      const fallback = await applyBaseFilters(admin.from("system_vocabulary")).order("sort_key", { ascending: true }).range(0, 999);
      if (fallback.error) throw fallback.error;
      const matching = (fallback.data ?? []).filter((row) => String(row.jlpt_level ?? "").trim().toUpperCase() === level);
      count = matching.length;
      data = matching.slice((page - 1) * limit, page * limit);
    }
    // System vocabulary never invokes a public machine-translation service at
    // read time. Japanese definitions are filled only by the trusted,
    // sense-aware Tomoshi import pipeline.
    const localizedRows = (data ?? []).map((row) => applyVerifiedJapaneseSystemTranslation(row));
    const ids = localizedRows.map((item) => item.id);
    const { data: userRows, error: userError } = ids.length ? await admin.from("vocabulary_cards").select("id,system_word_id,is_favorite,learning_status").eq("user_id", context.userId).is("deleted_at", null).in("system_word_id", ids) : { data: [], error: null };
    if (userError) throw userError;
    const states = new Map((userRows ?? []).map((row) => [row.system_word_id, row]));
    return NextResponse.json({ items: localizedRows.map((row) => catalogCard(row, states.get(row.id))), page, limit, total: count ?? 0, hasNext: page * limit < (count ?? 0) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[vocabulary.catalog] list failed", { message: error instanceof Error ? error.message : String(error) });
    return jsonError("內建單字庫暫時無法讀取；若剛部署，請先套用資料庫 migration。", 503);
  }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("請選擇要處理的單字。", 400);
  try {
    const admin = createAdminClient();
    const { data: systemWords, error: catalogError } = await admin.from("system_vocabulary").select("*").eq("is_active", true).in("id", parsed.data.ids);
    if (catalogError) throw catalogError;
    if ((systemWords?.length ?? 0) !== parsed.data.ids.length) return jsonError("找不到指定的內建單字。", 404);
    const verifiedSystemWords = (systemWords ?? []).map((word) => applyVerifiedJapaneseSystemTranslation(word));
    const catalogWords = verifiedSystemWords.map((word) => word.word);
    const { data: existing, error: existingError } = await admin.from("vocabulary_cards").select("id,system_word_id,is_favorite,learning_status,language,word").eq("user_id", context.userId).is("deleted_at", null).in("word", catalogWords);
    if (existingError) throw existingError;
    const current = new Map<string, (typeof existing extends (infer Row)[] | null ? Row : never)>();
    for (const row of existing ?? []) {
      if (row.system_word_id) current.set(row.system_word_id, row);
    }
    const wantsLearning = parsed.data.action === "learn" || parsed.data.action === "batchLearn";

    for (const word of verifiedSystemWords) {
      const row = current.get(word.id) ?? (existing ?? []).find((item) => item.language === word.language && item.word === word.word);
      if (parsed.data.action === "unfavorite") {
        if (row) {
          const { error } = await admin.from("vocabulary_cards").update({ is_favorite: false }).eq("id", row.id).eq("user_id", context.userId);
          if (error) throw error;
        }
        continue;
      }
      if (row) {
        const patch = wantsLearning ? { system_word_id: word.id, dictionary_entry_id: word.dictionary_entry_id, source_kind: "catalog", learning_status: row.learning_status === "paused" ? "learning" : row.learning_status, next_review_at: new Date().toISOString() } : { system_word_id: word.id, dictionary_entry_id: word.dictionary_entry_id, source_kind: "catalog", is_favorite: true };
        const { error } = await admin.from("vocabulary_cards").update(patch).eq("id", row.id).eq("user_id", context.userId);
        if (error) throw error;
        continue;
      }
      const { data: created, error: createError } = await admin.from("vocabulary_cards").insert({
        user_id: context.userId, system_word_id: word.id, dictionary_entry_id: word.dictionary_entry_id, source_kind: "catalog", language: word.language, word: word.word, reading: word.reading, kana: word.kana, romaji: word.romaji, ipa: word.ipa,
        primary_translation: word.meaning_zh_tw, english_definition: word.english_definition, part_of_speech: word.part_of_speech, jlpt_level: word.jlpt_level,
        language_details: { source: word.source, license: word.license, catalogVersion: word.dataset_version }, is_favorite: parsed.data.action === "favorite", learning_status: wantsLearning ? "learning" : "paused", next_review_at: new Date().toISOString(),
      }).select("id").single();
      if (createError) throw createError;
      const { error: meaningError } = await admin.from("vocabulary_meanings").insert({ card_id: created.id, meaning: word.meaning_zh_tw, language: "zh-TW", part_of_speech: word.part_of_speech, is_primary: true, sort_order: 0 });
      if (meaningError) throw meaningError;
    }
    return NextResponse.json({ ok: true, action: parsed.data.action, affected: parsed.data.ids.length });
  } catch (error) {
    console.error("[vocabulary.catalog] mutation failed", { message: error instanceof Error ? error.message : String(error) });
    return jsonError("無法更新你的單字庫，請稍後再試。", 503);
  }
}
