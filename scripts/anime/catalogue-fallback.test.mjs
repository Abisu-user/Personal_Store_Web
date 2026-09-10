import assert from "node:assert/strict";
import { test } from "node:test";
import { loadApp } from "../storage/harness.mjs";

const kitsuPayload = {
  meta: { count: 40 },
  included: [{ id: "mapping-1", type: "mappings", attributes: { externalSite: "myanimelist/anime", externalId: "52991" } }],
  data: [{
    id: "kitsu-1",
    type: "anime",
    attributes: {
      slug: "frieren-beyond-journeys-end",
      canonicalTitle: "Frieren: Beyond Journey's End",
      titles: { en: "Frieren: Beyond Journey's End", en_jp: "Sousou no Frieren", ja_jp: "葬送のフリーレン" },
      synopsis: "An elf mage remembers her journey.",
      subtype: "TV",
      status: "finished",
      episodeCount: 28,
      episodeLength: 24,
      startDate: "2023-09-29",
      endDate: "2024-03-22",
      averageRating: "89.12",
      posterImage: { large: "https://images.example/frieren.jpg" },
      coverImage: { large: "https://images.example/frieren-banner.jpg" },
      nsfw: false,
    },
    relationships: { mappings: { data: [{ type: "mappings", id: "mapping-1" }] } },
  }],
};

test("Kitsu catalogue keeps the existing Jikan identity contract", async () => {
  const calls = [];
  const load = loadApp({
    "@/lib/anime/bangumi-title-localizer": { localizeAnimeTitles: async (items) => items },
  }, {
    fetch: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify(kitsuPayload), { status: 200, headers: { "Content-Type": "application/vnd.api+json" } });
    },
  });
  const catalogue = load("src/lib/anime/kitsu-catalogue.ts");
  const result = await catalogue.getKitsuCatalogue({ page: 2, perPage: 20, sort: "SCORE_DESC" });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].source, "jikan");
  assert.equal(result.items[0].id, "52991");
  assert.equal(result.items[0].titleJapanese, "葬送のフリーレン");
  assert.equal(result.items[0].publicScore, 8.912);
  assert.equal(result.page, 2);
  assert.equal(result.hasNextPage, false);
  assert.match(calls[0], /page%5Boffset%5D=20/);
  assert.match(calls[0], /sort=-averageRating/);
});

test("Kitsu clamps catalogue page size to its real maximum of 20", async () => {
  const calls = [];
  const load = loadApp({
    "@/lib/anime/bangumi-title-localizer": { localizeAnimeTitles: async (items) => items },
  }, {
    fetch: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ ...kitsuPayload, data: [] }), { status: 200, headers: { "Content-Type": "application/vnd.api+json" } });
    },
  });
  const catalogue = load("src/lib/anime/kitsu-catalogue.ts");
  await catalogue.getKitsuCatalogue({ page: 1, perPage: 24 });
  assert.match(calls[0], /page%5Blimit%5D=20/);
});

test("Bangumi catalogue uses the requested container page size and maps its subject identity", async () => {
  const calls = [];
  const load = loadApp({}, {
    fetch: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ total: 100, data: [{ id: 326, name: "攻殻機動隊", name_cn: "攻壳机动队", date: "2004-01-01", platform: "TV", eps: 26, nsfw: false, rating: { score: 9.2 }, images: { large: "https://example.test/326.jpg" }, tags: [{ name: "科幻" }] }] }), { status: 200 });
    },
  });
  const catalogue = load("src/lib/anime/bangumi-catalogue.ts");
  const result = await catalogue.getBangumiCatalogue({ page: 2, perPage: 24 });
  assert.equal(result.items[0].source, "bangumi");
  assert.equal(result.items[0].id, "326");
  assert.equal(result.items[0].titleChinese, "攻殼機動隊");
  assert.match(calls[0], /limit=24/);
  assert.match(calls[0], /offset=24/);
});

test("Adult catalogue requests R+ and Rx ratings and keeps results marked adult", async () => {
  const calls = [];
  const load = loadApp({}, {
    fetch: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify([{ id: 11617, name: "High School DxD", kind: "tv", score: "7.3", status: "released", episodes: 12, aired_on: "2012-01-06", image: { original: "/cover.jpg" }, url: "/animes/11617" }]), { status: 200 });
    },
  });
  const catalogue = load("src/lib/anime/shikimori-catalogue.ts");
  const result = await catalogue.getShikimoriCatalogue({ page: 1, perPage: 24, includeAdult: true, search: "Highschool DxD" });
  assert.equal(result.items[0].source, "jikan");
  assert.equal(result.items[0].isAdult, true);
  assert.equal(result.items[0].contentRating, "成人內容");
  assert.match(calls[0], /rating=r_plus%2Crx/);
  assert.match(calls[0], /search=Highschool\+DxD/);
});

test("AniList catalogue failure uses Bangumi for regular Explore", async () => {
  const fallbackCalls = [];
  const fallbackPage = { items: [{ id: "52991" }], page: 1, hasNextPage: true, total: 40 };
  const load = loadApp({
    "@/lib/anime/bangumi-title-localizer": { localizeAnimeTitles: async (items) => items },
    "@/lib/anime/bangumi-catalogue": {
      getBangumiCatalogue: async (filters) => { fallbackCalls.push(filters); return fallbackPage; },
    },
    "@/lib/anime/shikimori-catalogue": { getShikimoriCatalogue: async () => { throw new Error("unexpected"); } },
    "@/lib/anime/kitsu-catalogue": {
      getKitsuCatalogue: async () => { throw new Error("unexpected"); },
      getKitsuTaxonomy: () => ({ genres: ["Action"], tags: [] }),
    },
  }, {
    fetch: async () => new Response(JSON.stringify({ errors: [{ message: "The AniList API has been temporarily disabled due to severe stability issues." }] }), { status: 403 }),
  });
  const catalogue = load("src/lib/anime/anilist-catalogue.ts");

  assert.equal(await catalogue.getCatalogue({ page: 1, perPage: 12 }), fallbackPage);
  assert.equal(fallbackCalls.length, 1);
  assert.deepEqual(await catalogue.getCatalogueTaxonomy(), { genres: ["Action"], tags: [] });
});

test("AniList catalogue failure uses the adult-rated fallback for adult Explore", async () => {
  const calls = [];
  const adultPage = { items: [{ id: "1639", isAdult: true }], page: 1, hasNextPage: false, total: 1 };
  const load = loadApp({
    "@/lib/anime/bangumi-title-localizer": { localizeAnimeTitles: async (items) => items },
    "@/lib/anime/bangumi-catalogue": { getBangumiCatalogue: async () => { throw new Error("unexpected"); } },
    "@/lib/anime/shikimori-catalogue": { getShikimoriCatalogue: async (filters) => { calls.push(filters); return adultPage; } },
    "@/lib/anime/kitsu-catalogue": { getKitsuCatalogue: async () => { throw new Error("unexpected"); }, getKitsuTaxonomy: () => ({ genres: [], tags: [] }) },
  }, {
    fetch: async () => new Response(JSON.stringify({ errors: [{ message: "disabled" }] }), { status: 403 }),
  });
  const catalogue = load("src/lib/anime/anilist-catalogue.ts");
  assert.equal(await catalogue.getCatalogue({ page: 1, perPage: 24, includeAdult: true }), adultPage);
  assert.equal(calls[0].includeAdult, true);
  assert.equal(calls[0].perPage, 24);
});
