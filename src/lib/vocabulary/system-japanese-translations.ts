import "server-only";
import translationIndex from "@/data/vocabulary/openjlpt-tomoshi-zhtw.json";

export type VerifiedJapaneseTranslation = {
  primaryMeaning: string;
  meanings: string[];
  secondaryMeanings: string[];
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
  translationMetadata: {
    source: string;
    confidence: "reviewed" | "source-normalized";
    primarySenseIndex: number | null;
    cardMeaningLimit: number;
    sensePolicy: string;
  };
};

type TranslationIndex = {
  entries: Record<string, VerifiedJapaneseTranslation>;
};

const entries = (translationIndex as TranslationIndex).entries;
const japaneseFormAliases = new Map([
  ["あいでぃあ", "あいであ"],
]);

function normalizeJapaneseForm(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[ァ-ヶ]/gu, (character) => String.fromCodePoint(character.codePointAt(0)! - 0x60))
    .replace(/[\s・]/gu, "");
}

const entriesByForm = (() => {
  const result = new Map<string, VerifiedJapaneseTranslation[]>();
  for (const [sourceEntryId, translation] of Object.entries(entries)) {
    // OpenJLPT IDs are `${level}:${word}:${normalizedReading}`.  Both the
    // written and reading forms are indexed so live dictionary searches can
    // reuse the reviewed, sense-aware Chinese wording.
    const [, word, reading] = sourceEntryId.split(":", 3);
    for (const form of [word, reading]) {
      if (!form) continue;
      const normalized = normalizeJapaneseForm(form);
      if (!normalized) continue;
      result.set(normalized, [...(result.get(normalized) ?? []), translation]);
    }
  }
  return result;
})();

/**
 * OpenJLPT sourceEntryId is stable: `${level}:${word}:${normalizedReading}`.
 * It lets the catalog display only reviewed, sense-aware Traditional Chinese
 * data even before a background dataset refresh persists the same values.
 */
export function getVerifiedJapaneseSystemTranslation(sourceEntryId: unknown) {
  return typeof sourceEntryId === "string" ? entries[sourceEntryId] ?? null : null;
}

/**
 * Jisho/Open Dictionary results do not carry the OpenJLPT source ID.  Resolve
 * an exact written or reading form to the same reviewed source data instead
 * of falling back to a literal English → Chinese translation.
 */
export function getVerifiedJapaneseTranslationByForm(...forms: Array<string | null | undefined>) {
  for (const form of forms) {
    if (!form) continue;
    const normalized = normalizeJapaneseForm(form);
    const candidates = entriesByForm.get(normalized) ?? entriesByForm.get(japaneseFormAliases.get(normalized) ?? "");
    if (candidates?.length) return candidates[0];
  }
  return null;
}

export function applyVerifiedJapaneseSystemTranslation<T extends Record<string, unknown>>(row: T): T {
  if (row.language !== "ja") return row;
  const translation = getVerifiedJapaneseSystemTranslation(row.source_entry_id);
  if (!translation) return row;
  return {
    ...row,
    meaning_zh_tw: translation.primaryMeaning,
    meanings_zh_tw: translation.meanings,
    secondary_meanings_zh_tw: translation.secondaryMeanings,
    translation_senses_zh_tw: translation.senses,
    translation_metadata: translation.translationMetadata,
    english_definition: translation.englishDefinition ?? row.english_definition,
    part_of_speech: translation.partOfSpeech ?? row.part_of_speech,
  };
}
