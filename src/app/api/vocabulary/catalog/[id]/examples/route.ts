import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { runVocabularyAssistant } from "@/lib/vocabulary/ai-assistant";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const difficulty = z.enum(["N5", "N4", "N3", "N2", "N1", "A1", "A2", "B1", "B2", "C1", "C2", "unknown"]);
const exampleInput = z.object({ sentence: z.string().trim().min(1).max(1500), reading: z.string().trim().max(1500).optional().nullable(), translationZhTw: z.string().trim().min(1).max(1500), senseId: z.string().trim().max(100).optional().nullable(), difficultyLevel: difficulty.optional().nullable() });
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addUser"), cardId: uuid, example: exampleInput }),
  z.object({ action: z.literal("generateAi"), difficultyLevel: difficulty.default("unknown"), senseId: z.string().trim().max(100).optional().nullable() }),
  z.object({ action: z.literal("saveAi"), cardId: uuid, examples: z.array(exampleInput).min(1).max(4) }),
]);

const toExample = (row: any) => ({
  id: row.id,
  senseId: row.sense_id ?? null,
  language: row.language ?? null,
  sentence: row.sentence,
  reading: row.reading ?? null,
  translationZhTw: row.translation_zh_tw ?? null,
  originalTranslation: row.translation ?? null,
  difficultyLevel: row.difficulty_level ?? "unknown",
  source: row.source ?? "manual",
  sourceId: row.source_id ?? null,
  isVerified: Boolean(row.is_verified),
  kind: row.example_kind ?? "user",
  createdAt: row.created_at,
});
const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status });

async function getCatalogWord(id: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("system_vocabulary").select("id,language,word,reading,meaning_zh_tw,translation_senses_zh_tw,dictionary_entry_id").eq("id", id).eq("is_active", true).maybeSingle();
  if (error) throw error;
  return data;
}

async function ownedCardId(userId: string, catalogId: string, supplied?: string) {
  const admin = createAdminClient();
  let query = admin.from("vocabulary_cards").select("id").eq("user_id", userId).eq("system_word_id", catalogId).is("deleted_at", null);
  if (supplied) query = query.eq("id", supplied);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const { id } = await params;
  if (!uuid.safeParse(id).success) return jsonError("單字識別碼不正確。", 400);
  const limit = Math.max(1, Math.min(10, Number(request.nextUrl.searchParams.get("limit")) || 3));
  const offset = Math.max(0, Math.min(100, Number(request.nextUrl.searchParams.get("offset")) || 0));
  try {
    const catalog = await getCatalogWord(id);
    if (!catalog?.dictionary_entry_id) return jsonError("此單字尚未連結可用的字典資料。", 404);
    const admin = createAdminClient();
    const [systemResult, countResult, cardId] = await Promise.all([
      admin.from("vocabulary_examples").select("*").is("card_id", null).eq("dictionary_entry_id", catalog.dictionary_entry_id).order("sense_id").order("created_at").range(offset, offset + limit - 1),
      admin.from("vocabulary_examples").select("id", { count: "exact", head: true }).is("card_id", null).eq("dictionary_entry_id", catalog.dictionary_entry_id),
      ownedCardId(context.userId, id),
    ]);
    if (systemResult.error || countResult.error) throw systemResult.error ?? countResult.error;
    const { data: userRows, error: userError } = cardId ? await admin.from("vocabulary_examples").select("*").eq("card_id", cardId).order("created_at", { ascending: false }).limit(50) : { data: [], error: null };
    if (userError) throw userError;
    return NextResponse.json({
      word: { id: catalog.id, language: catalog.language, word: catalog.word, reading: catalog.reading, meaningZhTw: catalog.meaning_zh_tw, senses: catalog.translation_senses_zh_tw ?? [] },
      cardId, examples: (systemResult.data ?? []).map(toExample), userExamples: (userRows ?? []).map(toExample), total: countResult.count ?? 0, hasMore: offset + limit < (countResult.count ?? 0), nextOffset: offset + limit,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[vocabulary.examples] read failed", { id, message: error instanceof Error ? error.message : String(error) });
    return jsonError("例句資料暫時無法讀取；若剛部署，請先套用例句 migration。", 503);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const { id } = await params;
  if (!uuid.safeParse(id).success) return jsonError("單字識別碼不正確。", 400);
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("請檢查例句欄位。", 400);
  try {
    const catalog = await getCatalogWord(id);
    if (!catalog) return jsonError("找不到指定的內建單字。", 404);
    if (parsed.data.action === "generateAi") {
      const generateInput = parsed.data;
      const senses = Array.isArray(catalog.translation_senses_zh_tw) ? catalog.translation_senses_zh_tw : [];
      const result = await runVocabularyAssistant(context.userId, "examples", catalog.language === "en" ? "en" : "ja", `請為「${catalog.word}${catalog.reading ? `（${catalog.reading}）` : ""}」產生例句。主要意思：${catalog.meaning_zh_tw ?? "未提供"}。可用詞義資料：${JSON.stringify(senses)}。請優先對應 sense ${generateInput.senseId ?? "最常用詞義"}。目標難度：${generateInput.difficultyLevel}（僅作學習難度提示，不可當成已驗證檢定級別）。`);
      return NextResponse.json({ preview: result.examples.map((example) => ({ ...example, senseId: generateInput.senseId ?? null, difficultyLevel: generateInput.difficultyLevel, source: "ai", isVerified: false })) });
    }
    const suppliedCardId = parsed.data.action === "addUser" || parsed.data.action === "saveAi" ? parsed.data.cardId : undefined;
    const cardId = await ownedCardId(context.userId, id, suppliedCardId);
    if (!cardId) return jsonError("請先將此單字加入我的單字庫，才能保存自己的例句。", 409);
    const values = parsed.data.action === "addUser" ? [parsed.data.example] : parsed.data.examples;
    const kind = parsed.data.action === "addUser" ? "user" : "ai";
    const { error } = await createAdminClient().from("vocabulary_examples").insert(values.map((example) => ({ card_id: cardId, meaning_id: null, dictionary_entry_id: null, sense_id: example.senseId ?? null, language: catalog.language, sentence: example.sentence, reading: example.reading?.trim() || null, translation: example.translationZhTw, translation_zh_tw: example.translationZhTw, difficulty_level: example.difficultyLevel ?? "unknown", source: kind, source_id: null, is_verified: false, example_kind: kind, is_favorite: false })));
    if (error) throw error;
    return NextResponse.json({ ok: true, added: values.length });
  } catch (error) {
    console.error("[vocabulary.examples] mutation failed", { id, action: parsed.data.action, message: error instanceof Error ? error.message : String(error) });
    return jsonError("無法儲存例句，請稍後再試。", 503);
  }
}
