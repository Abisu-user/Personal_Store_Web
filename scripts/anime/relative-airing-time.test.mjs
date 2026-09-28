import assert from "node:assert/strict";
import test from "node:test";
import { relativeAiringTime } from "../../src/lib/anime/relative-airing-time.ts";

const now = new Date(2026, 8, 28, 18, 0).getTime();
const ago = (seconds) => (now - seconds * 1000) / 1000;

test("actual aired time uses minutes and hours", () => {
  assert.equal(relativeAiringTime(ago(30), now), "剛剛更新");
  assert.equal(relativeAiringTime(ago(180), now), "3 分鐘前更新");
  assert.equal(relativeAiringTime(ago(7200), now), "2 小時前更新");
});

test("older airings use calendar days or a date", () => {
  assert.equal(relativeAiringTime(ago(86400), now), "昨天更新");
  assert.equal(relativeAiringTime(ago(3 * 86400), now), "3 天前更新");
  assert.equal(relativeAiringTime(ago(10 * 86400), now), "9 月 18 日更新");
});
