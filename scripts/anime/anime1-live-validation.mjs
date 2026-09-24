import { matchAnime1, parseAnime1Index } from "../../src/lib/anime/anime-title-matcher.ts";

const response = await fetch("https://anime1.me/%E5%8B%95%E7%95%AB%E5%88%97%E8%A1%A8");
if (!response.ok) throw new Error(`Anime1 index returned ${response.status}`);
const rows = parseAnime1Index(await response.text());
const result = matchAnime1({
  id: "154587",
  source: "anilist",
  title: "Sousou no Frieren",
  titleChinese: "葬送的芙莉蓮",
  titleJapanese: "葬送のフリーレン",
  titleEnglish: "Frieren: Beyond Journey's End",
  originalTitle: "Sousou no Frieren",
  titleUserPreferred: "葬送のフリーレン",
  synonyms: ["Frieren"],
  releaseYear: 2023,
  season: "fall",
}, rows, true);

console.log(JSON.stringify({
  indexRows: rows.length,
  status: result.status,
  title: result.title,
  url: result.url,
}, null, 2));
if (result.status !== "available") process.exitCode = 1;
