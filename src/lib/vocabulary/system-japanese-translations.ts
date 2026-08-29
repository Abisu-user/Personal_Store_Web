import "server-only";
import translationIndex from "@/data/vocabulary/openjlpt-tomoshi-zhtw.json";

export type VerifiedJapaneseTranslation = {
  primaryMeaning: string;
  meanings: string[];
  senses: Array<{
    index: number;
    glosses: string[];
    partOfSpeech: string[];
    notes: string | null;
    zhTw: string[];
    examplesZhTw: string[];
  }>;
  englishDefinition: string | null;
  partOfSpeech: string | null;
};

type TranslationIndex = {
  entries: Record<string, VerifiedJapaneseTranslation>;
};

const entries = (translationIndex as TranslationIndex).entries;

/**
 * OpenJLPT sourceEntryId is stable: `${level}:${word}:${normalizedReading}`.
 * It lets the catalog display only reviewed, sense-aware Traditional Chinese
 * data even before a background dataset refresh persists the same values.
 */
export function getVerifiedJapaneseSystemTranslation(sourceEntryId: unknown) {
  return typeof sourceEntryId === "string" ? entries[sourceEntryId] ?? null : null;
}

export function applyVerifiedJapaneseSystemTranslation<T extends Record<string, unknown>>(row: T): T {
  if (row.language !== "ja") return row;
  const translation = getVerifiedJapaneseSystemTranslation(row.source_entry_id);
  if (!translation) return row;
  return {
    ...row,
    meaning_zh_tw: translation.primaryMeaning,
    meanings_zh_tw: translation.meanings,
    english_definition: translation.englishDefinition ?? row.english_definition,
    part_of_speech: translation.partOfSpeech ?? row.part_of_speech,
  };
}
