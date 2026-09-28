import assert from "node:assert/strict";
import { test } from "node:test";
import { loadApp } from "../storage/harness.mjs";

function media(id, native, options = {}) {
  return {
    id, idMal: id, title: { native, romaji: options.romaji ?? `Romaji ${id}`, english: options.english ?? null, userPreferred: null },
    synonyms: options.synonyms ?? [], coverImage: { extraLarge: `https://anilist.example/${id}.jpg` },
    bannerImage: null, description: "AniList metadata", format: options.format ?? "TV", status: "FINISHED",
    episodes: options.episodes ?? 12, duration: 24, seasonYear: options.year ?? 2021,
    startDate: { year: options.year ?? 2021, month: 1, day: 1 }, averageScore: 80,
    popularity: 100, countryOfOrigin: options.country ?? "JP", genres: [], studios: { nodes: [] },
    source: "MANGA", isAdult: options.adult ?? true, siteUrl: null,
  };
}

function candidate(id, name, chinese, options = {}) {
  return { id, name, nameChinese: chinese, year: options.year ?? 2021,
    malId: options.malId ?? null, format: options.format ?? "TV", episodes: options.episodes ?? 12 };
}

function setup(candidates = [], primary = [], candidateMedia = [], hasNextPage = false) {
  const calls = [];
  const scopes = [];
  const load = loadApp({ "@/lib/anime/bangumi-title-localizer": {
    isChineseAnimeSearch: (query) => /\p{Script=Han}/u.test(query) && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query),
    searchBangumiChineseCandidates: async (_query, scope) => { scopes.push(scope); return candidates; },
    chineseSearchRelevance: (query, titles) => Math.max(0, ...titles.map((title) => {
      if (!title) return 0;
      const needle = query.replace(/\W/g, "");
      const haystack = title.replace(/\W/g, "");
      return haystack === needle ? 4 : haystack.startsWith(needle) ? 3 : haystack.includes(needle) ? 2 : 0;
    })),
    localizeAnimeTitles: async (items) => items,
  } }, { fetch: async (_url, init) => {
    const body = JSON.parse(String(init.body));
    calls.push(body);
    const data = body.query.includes("ChineseAnimeCandidates")
      ? Object.fromEntries(candidates.map((_, index) => [`candidate${index}`, { media: candidateMedia[index] ?? [] }]))
      : { Page: { pageInfo: { currentPage: body.variables.page, hasNextPage, total: primary.length }, media: primary } };
    return new Response(JSON.stringify({ data }), { status: 200 });
  } });
  return { getCatalogue: load("src/lib/anime/anilist-catalogue.ts").getCatalogue, calls, scopes };
}

test("full, partial and translated Chinese titles can discover verified AniList adult metadata", async () => {
  for (const search of ["回復術士的重來人生", "回復術士", "緣之空"]) {
    const isSora = search === "緣之空";
    const native = isSora ? "ヨスガノソラ" : "回復術士のやり直し";
    const chinese = isSora ? "緣之空" : "回復術士的重來人生";
    const source = candidate(1, native, chinese, { year: isSora ? 2010 : 2021 });
    const row = media(100, native, { year: isSora ? 2010 : 2021 });
    const { getCatalogue, calls, scopes } = setup([source], [], [[row]]);
    const result = await getCatalogue({ search, includeAdult: true, sort: "SEARCH_MATCH", perPage: 24 });
    assert.deepEqual(result.items.map((item) => item.id), ["100"], search);
    assert.equal(result.items[0].source, "anilist", search);
    assert.equal(result.items[0].isAdult, true, search);
    assert.equal(result.items[0].titleChinese, chinese, search);
    assert.equal(result.items[0].coverUrl, "https://anilist.example/100.jpg", search);
    assert.deepEqual(scopes, ["adult"], search);
    assert.equal(calls.length, 2, search);
    assert.match(calls[1].query, /isAdult: true/, search);
  }
});

test("non-adult, non-Japanese and ambiguous lookalikes never enter adult discovery", async () => {
  const source = candidate(2, "同名作品", "同名作品");
  const { getCatalogue } = setup([source], [], [[
    media(101, "同名作品", { adult: false }),
    media(102, "同名作品", { country: "CN" }),
    media(103, "同名作品", { year: 2021 }),
    media(104, "同名作品", { year: 2021 }),
  ]]);
  assert.deepEqual((await getCatalogue({ search: "同名作品", includeAdult: true, sort: "SEARCH_MATCH" })).items, []);
});

test("format, year and episode conflicts are rejected for adult sequels", async () => {
  const source = candidate(3, "系列作品 第二季", "系列作品 第二季", { format: "OVA", episodes: 1, year: 2024 });
  const { getCatalogue } = setup([source], [], [[media(105, "系列作品 第二季", { format: "TV", episodes: 12, year: 2021 })]]);
  assert.equal((await getCatalogue({ search: "系列作品", includeAdult: true, sort: "SEARCH_MATCH" })).items.length, 0);
});

test("adult merge uses AniList ID, prioritizes exact Chinese title and removes injected IDs from page two", async () => {
  const source = candidate(4, "回復術士のやり直し", "回復術士的重來人生");
  const target = media(106, "回復術士のやり直し");
  const other = media(107, "回復術士の別作品");
  const first = setup([source], [other, target], [[target]], true);
  const firstPage = await first.getCatalogue({ search: "回復術士", includeAdult: true, sort: "SEARCH_MATCH", page: 1, perPage: 24 });
  assert.deepEqual(firstPage.items.map((item) => item.id), ["106", "107"]);
  assert.equal(firstPage.items[0].titleChinese, "回復術士的重來人生");
  assert.equal(firstPage.hasNextPage, true);
  const second = setup([source], [target, other], [[target]], false);
  const secondPage = await second.getCatalogue({ search: "回復術士", includeAdult: true, sort: "SEARCH_MATCH", page: 2, perPage: 24 });
  assert.deepEqual(secondPage.items.map((item) => item.id), ["107"]);
  assert.equal(secondPage.page, 2);
});

test("year and format filters apply to both primary and batched candidate lookups", async () => {
  const source = candidate(5, "回復術士のやり直し", "回復術士的重來人生");
  const { getCatalogue, calls } = setup([source], [], [[media(108, source.name)]]);
  await getCatalogue({ search: "回復術士", includeAdult: true, sort: "SEARCH_MATCH", seasonYear: 2021, format: "TV" });
  assert.equal(calls[0].variables.seasonYear, 2021);
  assert.equal(calls[0].variables.format, "TV");
  assert.equal(calls[1].variables.seasonYear, 2021);
  assert.equal(calls[1].variables.format, "TV");
  assert.match(calls[1].query, /countryOfOrigin: JP/);
});

test("non-Chinese and nonexistent terms do not create unnecessary candidate requests", async () => {
  for (const search of ["Yosuga no Sora", "ヨスガノソラ", "Redo of Healer"]) {
    const { getCatalogue, calls, scopes } = setup([], [media(109, "ヨスガノソラ")]);
    assert.equal((await getCatalogue({ search, includeAdult: true, sort: "SEARCH_MATCH" })).items.length, 1);
    assert.equal(calls.length, 1, search);
    assert.equal(scopes.length, 0, search);
  }
  const missing = setup();
  assert.deepEqual((await missing.getCatalogue({ search: "不存在的中文作品", includeAdult: true, sort: "SEARCH_MATCH" })).items, []);
  assert.deepEqual(missing.scopes, ["adult"]);
  assert.equal(missing.calls.length, 1);
});

test("short Chinese searches batch multiple candidates without accepting weak matches", async () => {
  const sources = [candidate(6, "回復術士のやり直し", "回復術士的重來人生"), candidate(7, "回復術士の続編", "回復術士續篇")];
  const { getCatalogue, calls } = setup(sources, [], [[media(110, sources[0].name)], [media(111, "無關作品")]]);
  const result = await getCatalogue({ search: "回", includeAdult: true, sort: "SEARCH_MATCH" });
  assert.deepEqual(result.items.map((item) => item.id), ["110"]);
  assert.equal(calls.length, 2);
  assert.match(calls[1].query, /candidate0: Page/);
  assert.match(calls[1].query, /candidate1: Page/);
});

test("adult and regular Bangumi candidate caches remain separate", async () => {
  const calls = [];
  const load = loadApp({}, { fetch: async (_url, init) => {
    calls.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ data: [{ id: 1, name: "回復術士のやり直し", name_cn: "回复术士的重来人生", type: 2, nsfw: false }] }), { status: 200 });
  } });
  const { searchBangumiChineseCandidates } = load("src/lib/anime/bangumi-title-localizer.ts");
  assert.equal((await searchBangumiChineseCandidates("回復術士", "general")).length, 1);
  assert.equal((await searchBangumiChineseCandidates("回復術士", "adult")).length, 1);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].filter.nsfw, false);
  assert.equal(calls[2].filter.nsfw, true);
  await searchBangumiChineseCandidates("回復術士", "adult");
  assert.equal(calls.length, 4);
});

test("adult catalogue route checks access before search and never browser-caches an unlocked result", async () => {
  let unlocked = false;
  let calls = 0;
  const load = loadApp({
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers ?? {} }) } },
    "@/lib/anime/anilist-catalogue": { getCatalogue: async () => { calls++; return { items: [], page: 1, hasNextPage: false, total: 0 }; } },
    "@/lib/anime/data": { getAnimePreferences: async () => ({ adultModeEnabled: true }) },
    "@/lib/security/activity": { getSecurityContext: async () => ({ userId: "test-user" }) },
    "@/lib/security/adult-content": { hasAdultContentAccess: async () => unlocked },
    "@/lib/security/adult-unlock": { hasUnlockedAdultAccess: async (_context, token) => token === "test-unlock-token" },
  });
  const { GET } = load("src/app/api/anime/catalogue/route.ts");
  const url = new URL("https://example.test/api/anime/catalogue?adult=1&search=%E7%B7%A3%E4%B9%8B%E7%A9%BA");
  const request = { nextUrl: url, headers: new Headers() };
  assert.equal((await GET(request)).status, 403);
  assert.equal(calls, 0);
  unlocked = true;
  assert.equal((await GET(request)).status, 403, "adult permission alone cannot bypass unlock");
  assert.equal(calls, 0);
  const permitted = await GET({ nextUrl: url, headers: new Headers({ "x-adult-unlock": "test-unlock-token" }) });
  assert.equal(permitted.status, 200);
  assert.equal(permitted.headers["Cache-Control"], "private, no-store");
  assert.equal(calls, 1);
});
