import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldMatchWatchSource,
  WATCH_SOURCE_ERROR_RETRY_MS,
  WATCH_SOURCE_MATCHING_STALE_MS,
} from "../../src/lib/anime/watch-source-match-state.ts";

const now = Date.parse("2026-09-24T12:00:00.000Z");
const state = (status, version = 2, checkedAt = null) => ({
  anime_id: "00000000-0000-4000-8000-000000000001",
  status,
  match_version: version,
  checked_at: checkedAt,
});

test("old favourites start unknown; successful matches are never re-requested", () => {
  assert.equal(shouldMatchWatchSource(state("unknown", 0), now, 2), true);
  assert.equal(shouldMatchWatchSource(state("matched", 0), now, 2), false);
});

test("not_found is cached until the matching algorithm version changes", () => {
  assert.equal(shouldMatchWatchSource(state("not_found", 2), now, 2), false);
  assert.equal(shouldMatchWatchSource(state("not_found", 1), now, 2), true);
  assert.equal(shouldMatchWatchSource(state("ambiguous", 2), now, 2), false);
  assert.equal(shouldMatchWatchSource(state("ambiguous", 1), now, 2), true);
});

test("temporary errors retry after the backoff, not on every page visit", () => {
  assert.equal(shouldMatchWatchSource(state("error", 2, new Date(now - WATCH_SOURCE_ERROR_RETRY_MS + 1).toISOString()), now, 2), false);
  assert.equal(shouldMatchWatchSource(state("error", 2, new Date(now - WATCH_SOURCE_ERROR_RETRY_MS).toISOString()), now, 2), true);
});

test("an interrupted matching claim becomes retryable after its lease expires", () => {
  assert.equal(shouldMatchWatchSource(state("matching", 2, new Date(now - WATCH_SOURCE_MATCHING_STALE_MS + 1).toISOString()), now, 2), false);
  assert.equal(shouldMatchWatchSource(state("matching", 2, new Date(now - WATCH_SOURCE_MATCHING_STALE_MS).toISOString()), now, 2), true);
});
