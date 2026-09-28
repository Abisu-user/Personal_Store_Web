import assert from "node:assert/strict";
import { test } from "node:test";
import { animeAliasMatchRank, normalizeAnimeAlias, resolveAnimeDisplayTitle } from "../../src/lib/anime/anime-alias.ts";

const alias = (text, language, scope = "global") => ({ alias: text, language, scope, isVerified: scope === "global", source: scope === "global" ? "anilist" : "user" });

test("traditional, simplified, width and punctuation normalize without changing original text", () => {
  assert.equal(normalizeAnimeAlias(" 黑獸：第一季 "), normalizeAnimeAlias("黑兽 第一季"));
  assert.equal(normalizeAnimeAlias("Ｋｕｒｏｉｎｕ ～").includes("kuroinu"), true);
});

test("alias ranking keeps exact ahead of prefix and substring", () => {
  assert.ok(animeAliasMatchRank("黑獸", "黑獸") > animeAliasMatchRank("黑獸", "黑兽"));
  assert.ok(animeAliasMatchRank("黑獸", "黑兽") > animeAliasMatchRank("黑獸", "黑獸動畫"));
  assert.ok(animeAliasMatchRank("黑獸", "黑獸動畫") > animeAliasMatchRank("黑獸", "動畫黑獸"));
  assert.equal(animeAliasMatchRank("不存在", "黑獸"), 0);
});

test("display title prefers custom, user traditional, verified traditional, then simplified", () => {
  const base = { title: "Kuroinu", titleIsCustom: false, titleEnglish: "Kuroinu", titleJapanese: "黒獣" };
  const aliases = [alias("黑兽", "zh-Hans"), alias("黑獸", "zh-Hant"), alias("私人的黑獸", "zh-Hant", "user")];
  assert.equal(resolveAnimeDisplayTitle({ ...base, customTitle: "我的名稱", aliases }), "我的名稱");
  assert.equal(resolveAnimeDisplayTitle({ ...base, aliases }), "私人的黑獸");
  assert.equal(resolveAnimeDisplayTitle({ ...base, aliases: aliases.slice(0, 2) }), "黑獸");
  assert.equal(resolveAnimeDisplayTitle({ ...base, aliases: aliases.slice(0, 1) }), "黑獸");
});

test("English or Romaji precedes native Japanese without Chinese", () => {
  assert.equal(resolveAnimeDisplayTitle({ title: "黒獣", titleIsCustom: false, titleEnglish: "Kuroinu", titleJapanese: "黒獣" }), "Kuroinu");
  assert.equal(resolveAnimeDisplayTitle({ title: "黒獣", titleIsCustom: false, titleJapanese: "黒獣" }), "黒獣");
});

test("legacy manually edited library title is preserved", () => {
  assert.equal(resolveAnimeDisplayTitle({ title: "我的作品名稱", externalSource: "anilist", titleEnglish: "Kuroinu", titleJapanese: "黒獣" }), "我的作品名稱");
});
