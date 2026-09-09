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

test("AniList catalogue failure automatically falls back instead of emptying Explore", async () => {
  const fallbackCalls = [];
  const fallbackPage = { items: [{ id: "52991" }], page: 1, hasNextPage: true, total: 40 };
  const load = loadApp({
    "@/lib/anime/bangumi-title-localizer": { localizeAnimeTitles: async (items) => items },
    "@/lib/anime/kitsu-catalogue": {
      getKitsuCatalogue: async (filters) => { fallbackCalls.push(filters); return fallbackPage; },
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
