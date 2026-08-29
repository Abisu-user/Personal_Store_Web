/*
 * Editorial Taiwan Chinese terminology layered on top of source-verified
 * JMdict/Tomoshi senses.  This is deliberately keyed by Japanese form and
 * JMdict sense index, never by an English gloss: English may explain a sense,
 * but it must not decide the Chinese meaning shown to a learner.
 *
 * The list is intentionally small and reviewable.  It corrects source terms
 * whose literal wording is technically understandable but not the natural
 * phrasing a Taiwan Japanese learner would normally use.  Additions require a
 * dictionary-source review and a regression test.
 */
function normalizeJapanese(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[ァ-ヶ]/gu, (character) => String.fromCodePoint(character.codePointAt(0) - 0x60))
    .replace(/[\s・]/gu, "");
}

const reviewedSenseOverrides = [
  {
    forms: ["アイデア", "アイディア"],
    senses: [{ index: 0, meanings: ["點子", "想法", "主意", "構想"] }],
  },
  {
    forms: ["相変わらず", "相變わらず"],
    senses: [{ index: 0, meanings: ["仍然", "依舊", "照舊", "還是老樣子"] }],
  },
  {
    forms: ["遭う"],
    senses: [
      { index: 0, meanings: ["相遇", "碰面", "見面"] },
      { index: 1, meanings: ["遭遇", "遇到", "碰上不好的事情"] },
    ],
  },
  {
    forms: ["扇ぐ"],
    senses: [
      { index: 0, meanings: ["搧風", "用扇子搧"] },
      { index: 1, meanings: ["煽動", "鼓動"] },
    ],
  },
  {
    forms: ["あきれる", "呆れる"],
    senses: [{ index: 0, meanings: ["傻眼", "驚訝到說不出話", "受不了"] }],
  },
  {
    forms: ["飽くまで"],
    senses: [{ index: 0, meanings: ["始終", "徹底", "堅持到底", "無論如何都"] }],
  },
];

function formsFor({ headword, reading }) {
  return new Set([headword, reading].filter(Boolean).map(normalizeJapanese));
}

/**
 * Applies reviewed Taiwan-language wording without changing sense boundaries.
 * Unknown entries keep every meaning supplied by the verified dictionary.
 */
export function applyTaiwanJapaneseTerminology(senses, identity = {}) {
  const forms = formsFor(identity);
  const override = reviewedSenseOverrides.find((candidate) => candidate.forms.some((form) => forms.has(normalizeJapanese(form))));
  if (!override) return senses;
  return senses.map((sense) => {
    const replacement = override.senses.find((item) => item.index === sense.index);
    return replacement ? { ...sense, meanings: replacement.meanings } : sense;
  });
}
