import assert from "node:assert/strict";
import { test } from "node:test";
import { loadApp } from "../storage/harness.mjs";

test("recent anime updates query only this user's watching, non-adult collection and sort by aired time", async () => {
  const filters = [];
  const rows = [
    { id: "older", title: "較早更新", cover_url: null, cover_storage_object_id: null, updated_at: "2026-09-01", external_id: "101", external_source: "anilist", episodes: 12 },
    { id: "newer", title: "最新更新", cover_url: null, cover_storage_object_id: null, updated_at: "2026-09-01", external_id: "102", external_source: "anilist", episodes: 24 },
  ];
  const query = {
    select: () => query,
    eq: (column, value) => { filters.push([column, value]); return query; },
    or: (value) => { filters.push(["or", value]); return query; },
    is: (column, value) => { filters.push([column, value]); return query; },
    limit: async () => ({ data: rows, error: null }),
  };
  const load = loadApp({
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers ?? {} }) } },
    "@/lib/anime/anilist-catalogue": {
      getAniListIdsForMalIds: async () => new Map(),
      getLatestAiredEpisodes: async () => new Map([
        [101, { episode: 3, airedAt: 1000, broadcastStatus: "RELEASING", totalEpisodes: 12 }],
        [102, { episode: 8, airedAt: 2000, broadcastStatus: "RELEASING", totalEpisodes: 24 }],
      ]),
    },
    "@/lib/anime/data": { getAnimePreferences: async () => ({ adultModeEnabled: false }) },
    "@/lib/security/activity": { getSecurityContext: async () => ({ userId: "owner" }) },
    "@/lib/security/adult-content": { hasAdultContentAccess: async () => false },
    "@/lib/security/adult-unlock": { hasUnlockedAdultAccess: async () => false },
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: (table) => { assert.equal(table, "anime_library"); return query; } }) },
  });
  const { GET } = load("src/app/api/anime/catalogue/route.ts");
  const response = await GET({ nextUrl: new URL("https://example.test/api/anime/catalogue?view=following"), headers: new Headers() });
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(filters, [
    ["user_id", "owner"], ["watch_status", "watching"], ["or", "is_adult.is.null,is_adult.eq.false"], ["deleted_at", null],
  ]);
  assert.equal(response.body.watchingCount, 2);
  assert.deepEqual(response.body.items.map((item) => item.id), ["newer", "older"]);
});
