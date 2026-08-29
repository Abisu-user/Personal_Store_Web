import assert from "node:assert/strict";
import test from "node:test";
import { buildVerifiedJapaneseTranslation } from "./tomoshi-zhtw.mjs";

const fixtures = [
  ["相変わらず", ["照舊", "一如既往", "如同往常", "依然"]],
  ["アイデア", ["想法", "主意", "概念"]],
  ["遭う", ["相遇", "碰面", "遭遇", "經歷不幸"]],
  ["扇ぐ", ["扇（風）", "煽動", "鼓動"]],
  ["あきれる", ["驚愕", "厭煩", "目瞪口呆"]],
  ["飽くまで", ["始終", "到底", "堅持不懈", "畢竟", "純粹"]],
];

function sourceFixture(meanings) {
  return {
    tomoshiDefinition: { senses: Object.fromEntries(meanings.map((meaning, index) => [String(index), { glosses: [{ text: meaning.join("；") }] }])), },
    tomoshiEntry: { senses: meanings.map(() => ({ pos: ["fixture"], glosses: [{ text: "fixture", lang: "eng" }] })) },
  };
}

for (const [word, expected] of fixtures) {
  test(`${word} retains every verified Traditional Chinese meaning`, () => {
    const translated = buildVerifiedJapaneseTranslation(sourceFixture([expected]));
    for (const meaning of expected) assert.ok(translated.meanings.includes(meaning), `${word} should include ${meaning}`);
    assert.equal(translated.senses.length, 1);
    assert.equal(translated.senses[0].zhTw.length, expected.length);
  });
}

test("separate source senses stay separate", () => {
  const translated = buildVerifiedJapaneseTranslation(sourceFixture([["相遇", "碰面"], ["遭遇", "經歷不幸"]]));
  assert.deepEqual(translated.senses.map((sense) => sense.zhTw), [["相遇", "碰面"], ["遭遇", "經歷不幸"]]);
});

test("Taiwan Japanese terminology is selected by Japanese form and sense, not English gloss", () => {
  const translated = buildVerifiedJapaneseTranslation({
    ...sourceFixture([["想法", "主意", "概念"]]),
    headword: "アイデア",
    reading: "アイデア",
  });
  assert.deepEqual(translated.senses[0].zhTw, ["點子", "想法", "主意", "構想"]);
  assert.equal(translated.primaryMeaning, "點子；想法；主意；構想");
});

test("editorial terminology never merges separate Japanese senses", () => {
  const translated = buildVerifiedJapaneseTranslation({
    ...sourceFixture([["相遇", "碰面"], ["遭遇", "經歷不幸"]]),
    headword: "遭う",
    reading: "あう",
  });
  assert.deepEqual(translated.senses.map((sense) => sense.zhTw), [
    ["相遇", "碰面", "見面"],
    ["遭遇", "遇到", "碰上不好的事情"],
  ]);
});
