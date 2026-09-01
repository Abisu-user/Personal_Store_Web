import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VocabularyCard, VocabularyDeck, VocabularyExample, VocabularyMeaning, VocabularyReviewLog, VocabularySettings, VocabularyTag, VocabularyWorkspaceData } from "@/lib/vocabulary/types";

const toCard = (row: any): VocabularyCard => ({
  id: row.id, language: row.language, word: row.word, reading: row.reading, kana: row.kana, romaji: row.romaji, pronunciation: row.pronunciation, ipa: row.ipa,
  primaryTranslation: row.primary_translation, englishDefinition: row.english_definition, partOfSpeech: row.part_of_speech, jlptLevel: row.jlpt_level, cefrLevel: row.cefr_level, frequency: row.frequency,
  languageDetails: row.language_details ?? {}, notes: row.notes, isFavorite: row.is_favorite, masteryLevel: row.mastery_level, learningStatus: row.learning_status, sourceKind: row.source_kind ?? "custom", systemWordId: row.system_word_id ?? null, dictionaryEntryId: row.dictionary_entry_id ?? null,
  reviewCount: row.review_count, correctCount: row.correct_count, wrongCount: row.wrong_count, consecutiveCorrect: row.consecutive_correct, currentIntervalDays: row.current_interval_days,
  lastReviewedAt: row.last_reviewed_at, nextReviewAt: row.next_review_at, deletedAt: row.deleted_at, createdAt: row.created_at, updatedAt: row.updated_at, meanings: [], examples: [], tags: [], deckIds: [],
});

export async function getVocabularyWorkspaceData(userId: string, includeTrash = false, language?: "ja" | "en"): Promise<VocabularyWorkspaceData> {
  const admin = createAdminClient();
  let cardsQuery = admin.from("vocabulary_cards").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(300);
  cardsQuery = includeTrash ? cardsQuery.not("deleted_at", "is", null) : cardsQuery.is("deleted_at", null);
  if (language) cardsQuery = cardsQuery.eq("language", language);
  const [{ data: cardRows, error: cardError }, { data: tagRows, error: tagError }, { data: deckRows, error: deckError }, { data: settingRow, error: settingsError }, { data: logRows, error: logsError }] = await Promise.all([
    cardsQuery, admin.from("vocabulary_tags").select("id,name,color").eq("user_id", userId).order("name").limit(100), admin.from("vocabulary_decks").select("id,name,description,language").eq("user_id", userId).order("updated_at", { ascending: false }).limit(100), admin.from("vocabulary_settings").select("*").eq("user_id", userId).maybeSingle(), admin.from("vocabulary_review_logs").select("id,card_id,rating,answer_result,old_mastery,new_mastery,old_interval,new_interval,reviewed_at").eq("user_id", userId).order("reviewed_at", { ascending: false }).limit(200),
  ]);
  if (cardError || tagError || deckError || settingsError || logsError) throw new Error("Vocabulary data unavailable");
  const cards = (cardRows ?? []).map(toCard);
  const cardIds = cards.map((card) => card.id);
  const dictionaryEntryIds = cards.flatMap((card) => card.dictionaryEntryId ? [card.dictionaryEntryId] : []);
  const [meaningsResult, examplesResult, systemExamplesResult, cardTagsResult, deckCardsResult] = cardIds.length ? await Promise.all([
    admin.from("vocabulary_meanings").select("*").in("card_id", cardIds).order("sort_order"),
    admin.from("vocabulary_examples").select("*").in("card_id", cardIds).order("created_at"),
    dictionaryEntryIds.length ? admin.from("vocabulary_examples").select("*").is("card_id", null).in("dictionary_entry_id", dictionaryEntryIds).order("created_at").limit(900) : Promise.resolve({ data: [] }),
    admin.from("vocabulary_card_tags").select("card_id,tag_id").in("card_id", cardIds),
    admin.from("vocabulary_deck_cards").select("deck_id,card_id").in("card_id", cardIds),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  if (meaningsResult.error || examplesResult.error || (systemExamplesResult as { error?: unknown }).error || cardTagsResult.error || deckCardsResult.error) throw new Error("Vocabulary relationships unavailable");
  const meanings = (meaningsResult.data ?? []).map((row: any): VocabularyMeaning => ({ id: row.id, cardId: row.card_id, meaning: row.meaning, language: row.language, description: row.description, partOfSpeech: row.part_of_speech, usageContext: row.usage_context, isPrimary: row.is_primary, sortOrder: row.sort_order }));
  const mapExample = (row: any): VocabularyExample => {
    const fallbackTranslation = typeof row.translation === "string" && /[\u3400-\u9fff]/.test(row.translation) ? row.translation : null;
    const translationZhTw = row.translation_zh_tw ?? fallbackTranslation;
    return { id: row.id, cardId: row.card_id, dictionaryEntryId: row.dictionary_entry_id ?? null, meaningId: row.meaning_id, senseId: row.sense_id ?? null, language: row.language ?? null, sentence: row.sentence, reading: row.reading, translation: translationZhTw, translationZhTw, difficultyLevel: row.difficulty_level ?? null, source: row.source, sourceId: row.source_id ?? null, isVerified: Boolean(row.is_verified), exampleKind: row.example_kind === "system" || row.example_kind === "ai" ? row.example_kind : "user", notes: row.notes, isFavorite: row.is_favorite };
  };
  const examples = (examplesResult.data ?? []).map(mapExample);
  const systemExamples = (systemExamplesResult.data ?? []).map(mapExample);
  const tagById = new Map((tagRows ?? []).map((row: any) => [row.id, { id: row.id, name: row.name, color: row.color } satisfies VocabularyTag]));
  const cardById = new Map(cards.map((card) => [card.id, card]));
  meanings.forEach((meaning) => cardById.get(meaning.cardId)?.meanings.push(meaning)); examples.forEach((example) => example.cardId && cardById.get(example.cardId)?.examples.push(example)); systemExamples.forEach((example) => cards.filter((card) => card.dictionaryEntryId === example.dictionaryEntryId).forEach((card) => card.examples.push(example)));
  (cardTagsResult.data ?? []).forEach((row: any) => { const tag = tagById.get(row.tag_id); if (tag) cardById.get(row.card_id)?.tags.push(tag); });
  (deckCardsResult.data ?? []).forEach((row: any) => cardById.get(row.card_id)?.deckIds.push(row.deck_id));
  const decks: VocabularyDeck[] = (deckRows ?? []).map((row: any) => ({ id: row.id, name: row.name, description: row.description, language: row.language, cardIds: (deckCardsResult.data ?? []).filter((link: any) => link.deck_id === row.id).map((link: any) => link.card_id) }));
  const settings: VocabularySettings = settingRow ? { dailyNewGoal: settingRow.daily_new_goal, dailyReviewGoal: settingRow.daily_review_goal, flashcardPreferences: settingRow.flashcard_preferences ?? {} } : { dailyNewGoal: 10, dailyReviewGoal: 30, flashcardPreferences: {} };
  const reviewLogs: VocabularyReviewLog[] = (logRows ?? []).map((row: any) => ({ id: row.id, cardId: row.card_id, rating: row.rating, answerResult: row.answer_result, oldMastery: row.old_mastery, newMastery: row.new_mastery, oldInterval: row.old_interval, newInterval: row.new_interval, reviewedAt: row.reviewed_at }));
  return { cards, tags: [...tagById.values()], decks, settings, reviewLogs };
}
