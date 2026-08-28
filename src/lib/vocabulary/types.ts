export type VocabularyLanguage = "ja" | "en" | (string & {});
export type VocabularyStatus = "new" | "learning" | "reviewing" | "mastered" | "paused";
export type ReviewRating = "again" | "difficult" | "good" | "easy" | "mastered";

export type VocabularyMeaning = { id: string; cardId: string; meaning: string; language: string; description: string | null; partOfSpeech: string | null; usageContext: string | null; isPrimary: boolean; sortOrder: number };
export type VocabularyExample = { id: string; cardId: string; meaningId: string | null; sentence: string; reading: string | null; translation: string | null; source: string | null; notes: string | null; isFavorite: boolean };
export type VocabularyTag = { id: string; name: string; color: string | null };
export type VocabularyDeck = { id: string; name: string; description: string | null; language: string | null; cardIds: string[] };
export type VocabularyCard = {
  id: string; language: VocabularyLanguage; word: string; reading: string | null; kana: string | null; romaji: string | null; pronunciation: string | null; ipa: string | null;
  primaryTranslation: string | null; englishDefinition: string | null; partOfSpeech: string | null; jlptLevel: string | null; cefrLevel: string | null; frequency: number | null;
  languageDetails: Record<string, unknown>; notes: string | null; isFavorite: boolean; masteryLevel: number; learningStatus: VocabularyStatus; sourceKind?: "custom" | "catalog"; systemWordId?: string | null;
  reviewCount: number; correctCount: number; wrongCount: number; consecutiveCorrect: number; currentIntervalDays: number; lastReviewedAt: string | null; nextReviewAt: string | null; deletedAt: string | null; createdAt: string; updatedAt: string;
  meanings: VocabularyMeaning[]; examples: VocabularyExample[]; tags: VocabularyTag[]; deckIds: string[];
};

export type VocabularySettings = { dailyNewGoal: number; dailyReviewGoal: number; flashcardPreferences: Record<string, unknown> };
export type VocabularyReviewLog = { id: string; cardId: string; rating: ReviewRating; answerResult: boolean; oldMastery: number; newMastery: number; oldInterval: number; newInterval: number; reviewedAt: string };
export type VocabularyWorkspaceData = { cards: VocabularyCard[]; decks: VocabularyDeck[]; tags: VocabularyTag[]; settings: VocabularySettings; reviewLogs: VocabularyReviewLog[] };
