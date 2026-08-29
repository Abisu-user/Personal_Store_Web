import assert from "node:assert/strict";
import test from "node:test";
import { buildVerifiedJapaneseTranslation } from "./tomoshi-zhtw.mjs";

function sourceFixture(meanings, { glosses = [], pos = ["v1"] } = {}) {
  return {
    tomoshiDefinition: {
      senses: Object.fromEntries(meanings.map((meaning, index) => [String(index), { glosses: [{ text: meaning.join("；") }] }])),
    },
    tomoshiEntry: {
      senses: meanings.map((_, index) => ({ pos, glosses: [{ text: glosses[index] ?? "fixture", lang: "eng" }] })),
    },
  };
}

const regressionCases = [
  ["アイデア", ["點子", "想法"]],
  ["遭う", ["遭遇", "碰上"]],
  ["当たり前", ["理所當然", "當然"]],
  ["暴れる", ["大鬧", "發狂"]],
  ["あぶる", ["烤", "炙"]],
  ["あふれる", ["溢出", "充滿"]],
  ["相変わらず", ["仍然", "依舊"]],
  ["あきれる", ["傻眼", "受不了"]],
];

for (const [word, expected] of regressionCases) {
  test(`${word} keeps the reviewed Taiwan learner primary meaning`, () => {
    const translated = buildVerifiedJapaneseTranslation({ ...sourceFixture([["source fixture"]]), headword: word, reading: word });
    for (const meaning of expected) assert.ok(translated.meanings.includes(meaning), `${word} should include ${meaning}`);
    assert.equal(translated.meanings.length <= 4, true);
    assert.equal(translated.translationMetadata.confidence, "reviewed");
  });
}

test("Japanese senses remain separate and secondary meanings do not leak onto the card", () => {
  const translated = buildVerifiedJapaneseTranslation(sourceFixture([["第一詞義", "第一補充"], ["第二詞義", "第二補充"]]));
  assert.deepEqual(translated.meanings, ["第一詞義", "第一補充"]);
  assert.deepEqual(translated.secondaryMeanings, ["第二詞義", "第二補充"]);
  assert.deepEqual(translated.senses.map((sense) => sense.zhTw), [["第一詞義", "第一補充"], ["第二詞義", "第二補充"]]);
});

test("metadata and radical entries never become vocabulary meanings", () => {
  const translated = buildVerifiedJapaneseTranslation({
    ...sourceFixture([["打哈欠", "哈欠"], ["「欠」部", "欠部（第76部首）"]], { glosses: ["yawn", "kanji 'yawning' radical (radical 76)"], pos: ["n"] }),
    headword: "あくび",
    reading: "あくび",
  });
  assert.deepEqual(translated.meanings, ["打哈欠", "哈欠"]);
  assert.equal(JSON.stringify(translated.senses).includes("部首"), false);
  assert.equal(JSON.stringify(translated.senses).toLowerCase().includes("radical"), false);
});

test("ordinary verbs discard contextual and computer-only translations", () => {
  const translated = buildVerifiedJapaneseTranslation({
    ...sourceFixture([["溢位", "滿溢", "充滿", "曬太陽取暖"]], { glosses: ["overflow"], pos: ["v1"] }),
    headword: "一般動詞",
    reading: "いっぱんどうし",
  });
  assert.deepEqual(translated.meanings, ["滿溢", "充滿"]);
  assert.equal(translated.translationMetadata.confidence, "source-normalized");
});

test("reviewed terminology is selected by Japanese form and never by English gloss", () => {
  const translated = buildVerifiedJapaneseTranslation({ ...sourceFixture([["理念"]], { glosses: ["idea"] }), headword: "アイディア", reading: "あいでぃあ" });
  assert.deepEqual(translated.meanings, ["點子", "想法", "主意", "構想"]);
});
