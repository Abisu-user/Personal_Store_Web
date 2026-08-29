import OpenCC from "opencc-js";
import { applyTaiwanJapaneseTerminology, getTaiwanJapaneseTerminologyPolicy } from "./taiwan-japanese-lexicon.mjs";

const toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });

export function normalizeJapanese(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[ァ-ヶ]/gu, (character) => String.fromCodePoint(character.codePointAt(0) - 0x60))
    .replace(/[\s・]/gu, "");
}

function splitMeanings(value) {
  return [...new Set(
    String(value ?? "")
      .split(/[；;]+/u)
      .map((meaning) => toTraditional(meaning.trim()))
      .filter(Boolean),
  )];
}

function orderedSenseEntries(value) {
  return Object.entries(value ?? {}).sort(([left], [right]) => Number(left) - Number(right));
}

const NON_LEXICAL_ZH_PATTERNS = [
  /(?:部首|第\s*\d+\s*部|「?.+?」?部$)/u,
  /(?:姓氏|名字|人名|地名)$/u,
];
const NON_LEXICAL_EN_PATTERNS = [
  /\b(?:radical|kanji .* radical|given name|surname|place name|name entry)\b/iu,
];
const CONTEXTUAL_USAGE_PATTERNS = [
  /(?:曬太陽|用.+?(?:來|去)|在.+?時)/u,
];

function isNonLexicalChineseMeaning(value) {
  const normalized = String(value ?? "").trim();
  return !normalized || NON_LEXICAL_ZH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isContextualUsageMeaning(value) {
  return CONTEXTUAL_USAGE_PATTERNS.some((pattern) => pattern.test(String(value ?? "")));
}

function isNonLexicalEnglishGloss(value) {
  return NON_LEXICAL_EN_PATTERNS.some((pattern) => pattern.test(String(value ?? "")));
}

function isComputerOnlySense(sourceSense) {
  const glosses = sourceSense?.glosses ?? [];
  return glosses.some((gloss) => /\b(?:computer|computing|programming|software|overflow error)\b/iu.test(gloss));
}

function normalizeSenseMeanings(meanings, sourceSense) {
  const cleaned = [...new Set((meanings ?? [])
    .map((meaning) => String(meaning).trim())
    .filter((meaning) => !isNonLexicalChineseMeaning(meaning))
    // Usage examples are useful in Details, but should never become a lexical
    // definition on a catalogue card (for example, "曬太陽取暖").
    .filter((meaning) => !isContextualUsageMeaning(meaning))
    // "overflow" is a valid English gloss in computing, but for an ordinary
    // Japanese verb we must not promote the technical Taiwan term "溢位".
    .filter((meaning) => !(meaning === "溢位" && !isComputerOnlySense(sourceSense))))];
  return cleaned;
}

function isLexicalSense(sense) {
  return sense.zhTw.length > 0 && !((sense.glosses ?? []).length > 0 && (sense.glosses ?? []).every(isNonLexicalEnglishGloss));
}

function selectPrimarySenseIndex(senses) {
  return senses
    .map((sense, position) => ({
      index: sense.index,
      // Source ordering remains the default, but non-lexical senses are not
      // allowed to win merely because they appear first in JMdict.
      score: (isLexicalSense(sense) ? 100 : -1000) - position,
    }))
    .sort((left, right) => right.score - left.score)[0]?.index ?? null;
}

/**
 * Converts Tomoshi's zh_defs_zhtw JSON into an ordered, sense-aware shape.
 * Every sense keeps all of its Traditional Chinese meanings rather than
 * collapsing them into a single machine-translated string.
 */
export function parseTraditionalChineseSenses(raw) {
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  return orderedSenseEntries(payload?.senses).map(([index, sense]) => ({
    index: Number(index),
    meanings: [...new Set((sense?.glosses ?? []).flatMap((gloss) => splitMeanings(gloss?.text)))],
    examples: Object.values(sense?.examples ?? {}).map((example) => toTraditional(String(example))).filter(Boolean),
  })).filter((sense) => sense.meanings.length > 0);
}

export function flattenTraditionalChineseMeanings(senses) {
  return [...new Set((senses ?? []).flatMap((sense) => sense.meanings ?? []))];
}

export function parseTomoshiEntry(raw) {
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  const senses = (payload?.senses ?? []).map((sense, index) => ({
    index,
    glosses: (sense?.glosses ?? []).filter((gloss) => gloss?.lang === "eng").map((gloss) => String(gloss.text).trim()).filter(Boolean),
    partOfSpeech: [...new Set((sense?.pos ?? []).map(String).filter(Boolean))],
    notes: sense?.notes ? String(sense.notes) : null,
  }));
  return {
    senses,
    englishDefinition: [...new Set(senses.flatMap((sense) => sense.glosses))].join("；") || null,
    partOfSpeech: [...new Set(senses.flatMap((sense) => sense.partOfSpeech))].join(" / ") || null,
  };
}

export function buildVerifiedJapaneseTranslation({ tomoshiDefinition, tomoshiEntry, headword = null, reading = null }) {
  const identity = { headword, reading };
  const policy = getTaiwanJapaneseTerminologyPolicy(identity);
  const sourceChineseSenses = parseTraditionalChineseSenses(tomoshiDefinition);
  const entry = parseTomoshiEntry(tomoshiEntry);
  const normalizedChineseSenses = sourceChineseSenses.map((sense) => {
    const sourceSense = entry.senses.find((candidate) => candidate.index === sense.index);
    return { ...sense, meanings: normalizeSenseMeanings(sense.meanings, sourceSense) };
  }).filter((sense) => sense.meanings.length > 0);
  const chineseSenses = applyTaiwanJapaneseTerminology(normalizedChineseSenses, identity);
  const senses = entry.senses.map((sense) => {
    const translated = chineseSenses.find((candidate) => candidate.index === sense.index);
    return {
      index: sense.index,
      glosses: sense.glosses,
      partOfSpeech: sense.partOfSpeech,
      notes: sense.notes,
      zhTw: translated?.meanings ?? [],
      examplesZhTw: translated?.examples ?? [],
    };
  }).filter((sense) => isLexicalSense(sense));
  const primarySenseIndex = policy?.primarySenseIndex ?? selectPrimarySenseIndex(senses);
  const primarySense = senses.find((sense) => sense.index === primarySenseIndex) ?? senses[0] ?? null;
  // Cards deliberately show only the most helpful 2–4 meanings from the
  // selected sense.  Remaining senses stay structured for the detail view.
  const meanings = [...new Set((primarySense?.zhTw ?? []).slice(0, 4))];
  const secondaryMeanings = [...new Set(senses
    .filter((sense) => sense.index !== primarySense?.index)
    .flatMap((sense) => sense.zhTw))];
  return {
    primaryMeaning: meanings.join("；") || null,
    meanings,
    secondaryMeanings,
    senses,
    englishDefinition: entry.englishDefinition,
    partOfSpeech: entry.partOfSpeech,
    translationMetadata: {
      source: "tomoshi-jmdict-zhtw",
      confidence: policy ? "reviewed" : "source-normalized",
      primarySenseIndex,
      cardMeaningLimit: 4,
      sensePolicy: policy ? "taiwan-editorial-review" : "source-order-with-metadata-filter",
    },
  };
}
