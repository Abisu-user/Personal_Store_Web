import assert from "node:assert/strict";
import test from "node:test";

import { matchAnime1, normalizeAnimeTitle, parseAnime1Index } from "../../src/lib/anime/anime-title-matcher.ts";

test("normalizes Chinese, English and Roman season markers", () => {
  assert.deepEqual(normalizeAnimeTitle("進擊的巨人 第三季"), { normalized: "進擊的巨人 第三季", base: "進擊的巨人", seasonNumber: 3 });
  assert.equal(normalizeAnimeTitle("Re:ZERO Season 2").seasonNumber, 2);
  assert.equal(normalizeAnimeTitle("Made in Abyss Part II").seasonNumber, 2);
  assert.equal(normalizeAnimeTitle("無職轉生III").seasonNumber, 3);
  assert.equal(normalizeAnimeTitle("無職轉生 III").seasonNumber, 3);
  assert.equal(normalizeAnimeTitle("葬送的芙莉蓮 2").seasonNumber, 2);
  assert.equal(normalizeAnimeTitle("Dr.STONE").base, normalizeAnimeTitle("Dr. STONE").base);
});

test("fails closed when the index table is empty or required headers changed", () => {
  assert.throws(() => parseAnime1Index("<table><tr><th>作品</th></tr></table>"), /required headers changed/);
  assert.throws(() => parseAnime1Index("<html></html>"), /required headers changed/);
});

test("parses the public table by header names and rejects non-anime1 hosts", () => {
  const html = `<table><thead><tr><th>年份</th><th>動畫名稱</th><th>字幕組</th><th>季節</th><th>集數</th></tr></thead><tbody>
    <tr><td>2026</td><td><a href="/?cat=1921">無職轉生 III</a></td><td>動漫國</td><td>春</td><td>12</td></tr>
    <tr><td>2026</td><td><a href="https://anime1.pw/?cat=9">不應匯入</a></td><td>-</td><td>冬</td><td>1</td></tr>
  </tbody></table>`;
  const rows = parseAnime1Index(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceTitle, "無職轉生 III");
  assert.equal(rows[0].sourceUrl, "https://anime1.me/?cat=1921");
  assert.equal(rows[0].year, 2026);
});

test("matches exact aliases but refuses a conflicting season", () => {
  const anime = { id: "100", source: "anilist", title: "Attack on Titan Season 3", titleChinese: "進擊的巨人 第三季", titleJapanese: null, titleEnglish: null, originalTitle: null, synonyms: [], releaseYear: 2018, season: "summer" };
  const rows = [
    { sourceTitle: "進擊的巨人 第三季", normalizedTitle: "進擊的巨人 第三季", sourceUrl: "https://anime1.me/?cat=3", episodeText: "22", year: 2018, seasonText: "夏", subtitleGroup: null, anilistId: null, manualMatch: false },
    { sourceTitle: "進擊的巨人 第二季", normalizedTitle: "進擊的巨人 第二季", sourceUrl: "https://anime1.me/?cat=2", episodeText: "12", year: 2017, seasonText: "春", subtitleGroup: null, anilistId: null, manualMatch: false },
  ];
  const result = matchAnime1(anime, rows, true);
  assert.equal(result.status, "available");
  assert.equal(result.url, "https://anime1.me/?cat=3");
});

test("keeps unavailable and ambiguous source states distinct", () => {
  const anime = { id: "101", source: "anilist", title: "Example", titleChinese: null, titleJapanese: null, titleEnglish: null, originalTitle: null, synonyms: [], releaseYear: null, season: null };
  assert.equal(matchAnime1(anime, [], false).status, "source_unavailable");
  assert.equal(matchAnime1(anime, [], true).status, "not_found");
});
