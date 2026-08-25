import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVocabularyWorkspaceData } from "@/lib/vocabulary/data";

export const dynamic = "force-dynamic";
const id = z.string().uuid();
const meaningSchema = z.object({ id, meaning: z.string().trim().min(1).max(1000), language: z.string().trim().min(2).max(20).default("zh-TW"), description: z.string().trim().max(3000).optional().nullable(), partOfSpeech: z.string().trim().max(80).optional().nullable(), usageContext: z.string().trim().max(500).optional().nullable(), isPrimary: z.boolean().default(false), sortOrder: z.number().int().min(0).max(1000).default(0) }).partial({ id: true });
const exampleSchema = z.object({ id, meaningId: id.optional().nullable(), sentence: z.string().trim().min(1).max(3000), reading: z.string().trim().max(1000).optional().nullable(), translation: z.string().trim().max(3000).optional().nullable(), source: z.string().trim().max(500).optional().nullable(), notes: z.string().trim().max(3000).optional().nullable(), isFavorite: z.boolean().default(false) }).partial({ id: true });
const payloadSchema = z.object({
  language: z.string().trim().regex(/^[a-z]{2,12}(-[A-Z]{2})?$/).default("ja"), word: z.string().trim().min(1).max(300), reading: z.string().trim().max(300).optional().nullable(), kana: z.string().trim().max(300).optional().nullable(), romaji: z.string().trim().max(300).optional().nullable(), pronunciation: z.string().trim().max(300).optional().nullable(), ipa: z.string().trim().max(300).optional().nullable(), primaryTranslation: z.string().trim().max(1000).optional().nullable(), englishDefinition: z.string().trim().max(3000).optional().nullable(), partOfSpeech: z.string().trim().max(80).optional().nullable(), jlptLevel: z.enum(["N5", "N4", "N3", "N2", "N1"]).optional().nullable(), cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional().nullable(), frequency: z.number().int().min(1).max(5).optional().nullable(), languageDetails: z.record(z.string(), z.unknown()).default({}), notes: z.string().trim().max(10000).optional().nullable(), isFavorite: z.boolean().default(false), masteryLevel: z.number().int().min(0).max(5).default(0), learningStatus: z.enum(["new", "learning", "reviewing", "mastered", "paused"]).default("new"), tagIds: z.array(id).max(30).default([]), deckIds: z.array(id).max(30).default([]), meanings: z.array(meaningSchema).max(30).default([]), examples: z.array(exampleSchema).max(50).default([]),
});
const updateSchema = payloadSchema.extend({ id });
const actionSchema = z.object({ ids: z.array(id).min(1).max(200), action: z.enum(["trash", "restore", "permanent"]) });
const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status });
const emptyToNull = (value?: string | null) => value?.trim() || null;

async function validateRelated(userId: string, tagIds: string[], deckIds: string[]) {
  const admin = createAdminClient();
  const [tags, decks] = await Promise.all([tagIds.length ? admin.from("vocabulary_tags").select("id").eq("user_id", userId).in("id", tagIds) : Promise.resolve({ data: [] }), deckIds.length ? admin.from("vocabulary_decks").select("id").eq("user_id", userId).in("id", deckIds) : Promise.resolve({ data: [] })]);
  return (tags.data?.length ?? 0) === tagIds.length && (decks.data?.length ?? 0) === deckIds.length;
}

async function replaceRelations(cardId: string, payload: z.infer<typeof payloadSchema>) {
  const admin = createAdminClient();
  const [{ error: tagDeleteError }, { error: deckDeleteError }, { error: meaningsDeleteError }, { error: examplesDeleteError }] = await Promise.all([
    admin.from("vocabulary_card_tags").delete().eq("card_id", cardId), admin.from("vocabulary_deck_cards").delete().eq("card_id", cardId), admin.from("vocabulary_meanings").delete().eq("card_id", cardId), admin.from("vocabulary_examples").delete().eq("card_id", cardId),
  ]);
  if (tagDeleteError || deckDeleteError || meaningsDeleteError || examplesDeleteError) throw new Error("Unable to replace relationships");
  const meaningRows = payload.meanings.length ? payload.meanings : payload.primaryTranslation ? [{ meaning: payload.primaryTranslation, language: "zh-TW", isPrimary: true, sortOrder: 0 }] : [];
  let meanings: { id: string; sort_order: number }[] = [];
  if (meaningRows.length) { const { data, error } = await admin.from("vocabulary_meanings").insert(meaningRows.map((meaning, index) => ({ card_id: cardId, meaning: meaning.meaning, language: meaning.language ?? "zh-TW", description: emptyToNull(meaning.description), part_of_speech: emptyToNull(meaning.partOfSpeech), usage_context: emptyToNull(meaning.usageContext), is_primary: meaning.isPrimary || index === 0, sort_order: meaning.sortOrder ?? index }))).select("id,sort_order"); if (error) throw error; meanings = data ?? []; }
  if (payload.examples.length) { const { error } = await admin.from("vocabulary_examples").insert(payload.examples.map((example) => ({ card_id: cardId, meaning_id: example.meaningId && meanings.some((meaning) => meaning.id === example.meaningId) ? example.meaningId : null, sentence: example.sentence, reading: emptyToNull(example.reading), translation: emptyToNull(example.translation), source: emptyToNull(example.source), notes: emptyToNull(example.notes), is_favorite: example.isFavorite }))); if (error) throw error; }
  if (payload.tagIds.length) { const { error } = await admin.from("vocabulary_card_tags").insert(payload.tagIds.map((tagId) => ({ card_id: cardId, tag_id: tagId }))); if (error) throw error; }
  if (payload.deckIds.length) { const { error } = await admin.from("vocabulary_deck_cards").insert(payload.deckIds.map((deckId) => ({ deck_id: deckId, card_id: cardId }))); if (error) throw error; }
}

const toRow = (payload: z.infer<typeof payloadSchema>) => ({ language: payload.language, word: payload.word, reading: emptyToNull(payload.reading), kana: emptyToNull(payload.kana), romaji: emptyToNull(payload.romaji), pronunciation: emptyToNull(payload.pronunciation), ipa: emptyToNull(payload.ipa), primary_translation: emptyToNull(payload.primaryTranslation), english_definition: emptyToNull(payload.englishDefinition), part_of_speech: emptyToNull(payload.partOfSpeech), jlpt_level: payload.jlptLevel ?? null, cefr_level: payload.cefrLevel ?? null, frequency: payload.frequency ?? null, language_details: payload.languageDetails, notes: emptyToNull(payload.notes), is_favorite: payload.isFavorite, mastery_level: payload.masteryLevel, learning_status: payload.learningStatus });

export async function GET(request: NextRequest) { const context = await getSecurityContext(); if (!context) return jsonError("Unauthorized", 401); try { return NextResponse.json(await getVocabularyWorkspaceData(context.userId, request.nextUrl.searchParams.get("trash") === "1"), { headers: { "Cache-Control": "private, no-store" } }); } catch { return jsonError("單字資料暫時無法讀取。", 503); } }

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return jsonError("Unauthorized", 401); const parsed = payloadSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError("請檢查單字欄位。", 400); if (!(await validateRelated(context.userId, parsed.data.tagIds, parsed.data.deckIds))) return jsonError("標籤或單字本不存在。", 400);
  try { const admin = createAdminClient(); const { data, error } = await admin.from("vocabulary_cards").insert({ user_id: context.userId, ...toRow(parsed.data) }).select("id").single(); if (error) throw error; await replaceRelations(data.id, parsed.data); return NextResponse.json({ id: data.id }, { status: 201 }); } catch { return jsonError("無法儲存單字，請稍後再試。", 503); }
}

export async function PUT(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return jsonError("Unauthorized", 401); const parsed = updateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError("請檢查單字欄位。", 400); if (!(await validateRelated(context.userId, parsed.data.tagIds, parsed.data.deckIds))) return jsonError("標籤或單字本不存在。", 400);
  try { const admin = createAdminClient(); const { data, error } = await admin.from("vocabulary_cards").update(toRow(parsed.data)).eq("id", parsed.data.id).eq("user_id", context.userId).is("deleted_at", null).select("id").maybeSingle(); if (error) throw error; if (!data) return jsonError("找不到單字。", 404); await replaceRelations(data.id, parsed.data); return NextResponse.json({ ok: true }); } catch { return jsonError("無法更新單字，請稍後再試。", 503); }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return jsonError("Unauthorized", 401); const parsed = actionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError("請選取要處理的單字。", 400);
  try { const admin = createAdminClient(); if (parsed.data.action === "permanent") { const { error } = await admin.from("vocabulary_cards").delete().eq("user_id", context.userId).in("id", parsed.data.ids).not("deleted_at", "is", null); if (error) throw error; } else { const updates = parsed.data.action === "trash" ? { deleted_at: new Date().toISOString() } : { deleted_at: null }; const { error } = await admin.from("vocabulary_cards").update(updates).eq("user_id", context.userId).in("id", parsed.data.ids); if (error) throw error; } return NextResponse.json({ ok: true }); } catch { return jsonError("無法更新單字狀態。", 503); }
}
