export type VocabularyLanguage = "ja" | "en" | (string & {});
export type VocabularyStatus = "new" | "learning" | "reviewing" | "mastered" | "paused";
export type ReviewRating = "again" | "difficult" | "good" | "easy" | "mastered";

export type VocabularyMeaning = { id: string; cardId: string; meaning: string; language: string; description: string | null; partOfSpeech: string | null; usageContext: string | null; isPrimary: boolean; sortOrder: number };
export type VocabularyExample = { id: string; cardId: string | null; dictionaryEntryId: string | null; meaningId: string | null; senseId: string | null; language: string | null; sentence: string; reading: string | null; translation: string | null; translationZhTw: string | null; difficultyLevel: string | null; source: string | null; sourceId: string | null; isVerified: boolean; exampleKind: "system" | "user" | "ai"; notes: string | null; isFavorite: boolean };
export type VocabularyTag = { id: string; name: string; color: string | null };
export type VocabularyDeck = { id: string; name: string; description: string | null; language: string | null; cardIds: string[] };
export type VocabularyCard = {
  id: string; language: VocabularyLanguage; word: string; reading: string | null; kana: string | null; romaji: string | null; pronunciation: string | null; ipa: string | null;
  primaryTranslation: string | null; englishDefinition: string | null; partOfSpeech: string | null; jlptLevel: string | null; cefrLevel: string | null; frequency: number | null;
  languageDetails: Record<string, unknown>; notes: string | null; isFavorite: boolean; masteryLevel: number; learningStatus: VocabularyStatus; sourceKind?: "custom" | "catalog"; systemWordId?: string | null; dictionaryEntryId?: string | null;
  reviewCount: number; totalAttempts: number; correctCount: number; wrongCount: number; correctRate: number; currentLevel: number; consecutiveCorrect: number; consecutiveWrong: number; recentResults: VocabularyAttemptResult[]; lastAnswerCorrect: boolean | null; lastAnsweredAt: string | null; currentIntervalDays: number; lastReviewedAt: string | null; nextReviewAt: string | null; deletedAt: string | null; createdAt: string; updatedAt: string;
  meanings: VocabularyMeaning[]; examples: VocabularyExample[]; tags: VocabularyTag[]; deckIds: string[];
};

export type VocabularyAttemptResult = { correct: boolean; answeredAt: string; durationMs: number | null; occurrenceIndex: number | null; mode: "review" | "quiz" | null };

export type VocabularySettings = { dailyNewGoal: number; dailyReviewGoal: number; flashcardPreferences: Record<string, unknown> };
export type VocabularyReviewLog = { id: string; cardId: string; rating: ReviewRating; answerResult: boolean; oldMastery: number; newMastery: number; oldInterval: number; newInterval: number; answerDurationMs: number | null; occurrenceIndex: number | null; studyMode: "review" | "quiz" | null; reviewedAt: string };
export type VocabularyWorkspaceData = { cards: VocabularyCard[]; decks: VocabularyDeck[]; tags: VocabularyTag[]; settings: VocabularySettings; reviewLogs: VocabularyReviewLog[] };
