import assert from "node:assert/strict";
import { test } from "node:test";
import { loadApp } from "../storage/harness.mjs";

const examples = [
  ["進擊", "進撃の巨人", "進擊的巨人", 2013, 25],
  ["進擊的巨人", "進撃の巨人", "進擊的巨人", 2013, 25],
  ["鬼滅之刃", "鬼滅の刃", "鬼滅之刃", 2019, 26],
  ["膽大黨", "ダンダダン", "膽大黨", 2024, 12],
  ["我推", "【推しの子】", "【我推的孩子】", 2023, 11],
  ["輝夜姬", "かぐや姫の物語", "輝夜姬物語", 2013, 1],
];

function media(id, native, year, episodes, isAdult = false) {
  return {
    id, idMal: id, title: { native, romaji: `Romaji ${id}`, english: null, userPreferred: null },
    synonyms: [], coverImage: { extraLarge: `https://anilist.example/${id}.jpg` },
    bannerImage: null, description: "AniList metadata", format: "TV", status: "FINISHED",
    episodes, duration: 24, seasonYear: year, startDate: { year, month: 1, day: 1 },
    averageScore: 80, popularity: 100, countryOfOrigin: "JP", genres: [],
    studios: { nodes: [] }, source: "MANGA", isAdult, siteUrl: null,
  };
}

function catalogueWith(candidates, primary, candidateMedia) {
  const calls = [];
  let bangumiCalls = 0;
  const localizer = {
    isChineseAnimeSearch: (query) => /\p{Script=Han}/u.test(query) && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query),
    searchBangumiChineseCandidates: async () => { bangumiCalls += 1; return candidates; },
    localizeAnimeTitles: async (items) => items,
  };
  const load = loadApp({ "@/lib/anime/bangumi-title-localizer": localizer }, {
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init.body));
      calls.push(body);
      const data = body.query.includes("ChineseAnimeCandidates")
        ? Object.fromEntries(candidates.map((_, index) => [`candidate${index}`, { media: candidateMedia[index] ?? [] }]))
        : { Page: { pageInfo: { currentPage: body.variables.page, hasNextPage: false, total: primary.length }, media: primary } };
      return new Response(JSON.stringify({ data }), { status: 200 });
    },
  });
  return { catalogue: load("src/lib/anime/anilist-catalogue.ts"), calls, bangumiCalls: () => bangumiCalls };
}

test("all six Traditional Chinese queries can add a strictly matched AniList result", async () => {
  for (const [search, native, chinese, year, episodes] of examples) {
    const candidate = { id: 900, name: native, nameChinese: chinese, year, malId: null, format: "TV", episodes };
    const { catalogue, calls, bangumiCalls } = catalogueWith([candidate], [], [[media(100, native, year, episodes)]]);
    const result = await catalogue.getCatalogue({ search, sort: "SEARCH_MATCH", page: 1, perPage: 24 });
    assert.equal(result.items.length, 1, search);
    assert.equal(result.items[0].id, "100", search);
    assert.equal(result.items[0].source, "anilist", search);
    assert.equal(result.items[0].titleChinese, chinese, search);
    assert.equal(result.items[0].coverUrl, "https://anilist.example/100.jpg", search);
    assert.equal(bangumiCalls(), 1, search);
    assert.equal(calls.length, 2, search);
    assert.match(calls[1].query, /fragment CandidateMedia on Media/, search);
    assert.match(calls[1].query, /isAdult: false/, search);
  }
});

test("romanized searches and adult searches keep their original single AniList request", async () => {
  for (const search of ["Shingeki no Kyojin", "Kimetsu no Yaiba", "Dandadan"]) {
    const { catalogue, calls, bangumiCalls } = catalogueWith([], [media(101, "進撃の巨人", 2013, 25)], []);
    const result = await catalogue.getCatalogue({ search, sort: "SEARCH_MATCH", page: 1, perPage: 24 });
    assert.equal(result.items[0].id, "101");
    assert.equal(calls.length, 1, search);
    assert.equal(bangumiCalls(), 0, search);
  }
  const adult = catalogueWith([], [media(102, "成人作品", 2024, 1, true)], []);
  assert.equal((await adult.catalogue.getCatalogue({ search: "成人", includeAdult: true })).items[0].id, "102");
  assert.equal(adult.calls.length, 1);
  assert.equal(adult.bangumiCalls(), 0);
});

test("format, episode and year conflicts reject misleading title aliases", async () => {
  const candidate = { id: 901, name: "鬼滅の刃 兄妹の絆", nameChinese: "鬼滅之刃 兄妹的羈絆", year: 2019, malId: null, format: "劇場版", episodes: 1 };
  const main = { ...media(103, "鬼滅の刃", 2019, 26), synonyms: ["鬼滅の刃-兄妹の絆-"] };
  const { catalogue } = catalogueWith([candidate], [], [[main]]);
  assert.equal((await catalogue.getCatalogue({ search: "鬼滅", sort: "SEARCH_MATCH" })).items.length, 0);
});

test("ambiguous same-title AniList identities are skipped rather than guessed", async () => {
  const candidate = { id: 902, name: "同名作品", nameChinese: "同名作品", year: 2024, malId: null, format: "TV", episodes: 12 };
  const { catalogue } = catalogueWith([candidate], [], [[media(104, "同名作品", 2024, 12), media(105, "同名作品", 2024, 12)]]);
  assert.equal((await catalogue.getCatalogue({ search: "同名作品", sort: "SEARCH_MATCH" })).items.length, 0);
});

test("the first page retains every original AniList row when a candidate is merged", async () => {
  const candidate = { id: 903, name: "進撃の巨人", nameChinese: "進擊的巨人", year: 2013, malId: null, format: "TV", episodes: 25 };
  const original = media(106, "進撃の巨人", 2013, 25);
  const other = media(107, "別的作品", 2013, 12);
  const { catalogue } = catalogueWith([candidate], [original, other], [[original]]);
  const result = await catalogue.getCatalogue({ search: "進擊", sort: "SEARCH_MATCH", page: 1, perPage: 24 });
  assert.deepEqual(result.items.map((item) => item.id), ["106", "107"]);
  assert.equal(result.items[0].titleChinese, "進擊的巨人");
  assert.equal(result.totalExact, true);
});

test("page two keeps AniList pagination without repeating the Bangumi lookup", async () => {
  const candidate = { id: 904, name: "進撃の巨人", nameChinese: "進擊的巨人", year: 2013, malId: null, format: "TV", episodes: 25 };
  const { catalogue, calls, bangumiCalls } = catalogueWith([candidate], [media(108, "別的作品", 2013, 12)], [[media(109, "進撃の巨人", 2013, 25)]]);
  const result = await catalogue.getCatalogue({ search: "進擊", sort: "SEARCH_MATCH", page: 2, perPage: 24 });
  assert.deepEqual(result.items.map((item) => item.id), ["108"]);
  assert.equal(result.page, 2);
  assert.equal(bangumiCalls(), 0);
  assert.equal(calls.length, 1);
});

test("a failed candidate metadata request leaves the AniList search usable", async () => {
  const candidate = { id: 905, name: "進撃の巨人", nameChinese: "進擊的巨人", year: 2013, malId: null, format: "TV", episodes: 25 };
  const calls = [];
  const load = loadApp({ "@/lib/anime/bangumi-title-localizer": {
    isChineseAnimeSearch: () => true,
    searchBangumiChineseCandidates: async () => [candidate],
    localizeAnimeTitles: async (items) => items,
  } }, { fetch: async (_url, init) => {
    const body = JSON.parse(String(init.body));
    calls.push(body);
    return new Response(JSON.stringify(body.query.includes("ChineseAnimeCandidates")
      ? { errors: [{ message: "candidate lookup unavailable" }] }
      : { data: { Page: { pageInfo: { currentPage: 1, hasNextPage: false, total: 1 }, media: [media(110, "別的作品", 2013, 12)] } } }), { status: 200 });
  } });
  const result = await load("src/lib/anime/anilist-catalogue.ts").getCatalogue({ search: "進擊", sort: "SEARCH_MATCH" });
  assert.deepEqual(result.items.map((item) => item.id), ["110"]);
  assert.equal(calls.length, 2);
});

test("Bangumi Chinese candidate search normalizes script, filters unrelated titles and caches reads", async () => {
  const calls = [];
  const load = loadApp({}, {
    fetch: async (_url, init) => {
      calls.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ data: [
        { id: 1, name: "ダンダダン", name_cn: "胆大党", date: "2024-10-03", platform: "TV", total_episodes: 12, type: 2, nsfw: false },
        { id: 2, name: "超特急ヒカリアン", name_cn: "铁胆火车侠", date: "1997-04-02", type: 2, nsfw: false },
      ] }), { status: 200 });
    },
  });
  const { searchBangumiChineseCandidates } = load("src/lib/anime/bangumi-title-localizer.ts");
  const first = await searchBangumiChineseCandidates("膽大黨");
  assert.deepEqual(first.map((item) => item.id), [1]);
  assert.equal(first[0].nameChinese, "膽大黨");
  assert.equal(first[0].episodes, 12);
  assert.equal(calls.length, 2);
  assert.deepEqual((await searchBangumiChineseCandidates("膽大黨")).map((item) => item.id), [1]);
  assert.equal(calls.length, 2);
});
