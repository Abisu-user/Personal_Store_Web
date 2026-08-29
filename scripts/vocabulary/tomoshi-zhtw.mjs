import OpenCC from "opencc-js";

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

export function buildVerifiedJapaneseTranslation({ tomoshiDefinition, tomoshiEntry }) {
  const chineseSenses = parseTraditionalChineseSenses(tomoshiDefinition);
  const entry = parseTomoshiEntry(tomoshiEntry);
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
  }).filter((sense) => sense.glosses.length || sense.zhTw.length);
  const meanings = flattenTraditionalChineseMeanings(chineseSenses);
  return {
    primaryMeaning: senses.find((sense) => sense.zhTw.length)?.zhTw.join("；") ?? meanings.join("；") ?? null,
    meanings,
    senses,
    englishDefinition: entry.englishDefinition,
    partOfSpeech: entry.partOfSpeech,
  };
}
