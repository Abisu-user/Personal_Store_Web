/**
 * Bounded, idempotent backfill for existing adult library rows with a real
 * AniList identity. Dry-run by default; run after the alias migration with
 * `node --env-file=.env.local scripts/anime/backfill-adult-aliases.mjs --apply`.
 */
import { createClient } from "@supabase/supabase-js";
import OpenCC from "opencc-js";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const simplify = OpenCC.Converter({ from: "tw", to: "cn" });
const normalized = (value) => simplify(value.normalize("NFKC").trim().toLowerCase()).replace(/[\s\p{P}\p{S}_]+/gu, "");
const language = (value) => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value) ? "ja" : /\p{Script=Han}/u.test(value) ? "zh-Hant" : "und";
const row = (id, alias, source, userId) => {
  const text = alias?.trim().slice(0, 500);
  const search = text && normalized(text);
  return search ? { anilist_id: id, alias: text, normalized_alias: search, language: language(text), source,
    source_reference: null, scope: userId ? "user" : "global", user_id: userId,
    is_adult: true, is_verified: !userId } : null;
};

async function verified(ids) {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: `query($ids:[Int!]!){Page(page:1,perPage:25){media(id_in:$ids,type:ANIME,isAdult:true,countryOfOrigin:JP){id title{romaji english native userPreferred} synonyms}}}`, variables: { ids } }),
  });
  if (!response.ok) throw new Error(`AniList verification failed: HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error("AniList verification returned GraphQL errors");
  return new Map((body.data?.Page?.media ?? []).map((item) => [item.id, item]));
}

let offset = 0;
let examined = 0;
let accepted = 0;
let aliases = 0;
while (true) {
  const { data, error } = await admin.from("anime_library")
    .select("id,user_id,external_source,external_id,title,title_is_custom,title_chinese,title_japanese,title_english,original_title")
    .eq("is_adult", true).eq("external_source", "anilist")
    .order("id").range(offset, offset + 99);
  if (error) throw error;
  if (!data?.length) break;
  examined += data.length;
  const ids = [...new Set(data.map((item) => Number(item.external_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const actual = await verified(chunk);
    const entries = new Map();
    for (const item of data) {
      const id = Number(item.external_id);
      const metadata = actual.get(id);
      if (!metadata) continue;
      accepted++;
      for (const [name, language] of [[metadata.title?.romaji, "und"], [metadata.title?.english, "en"],
        [metadata.title?.native, "ja"], [metadata.title?.userPreferred, metadata.title?.userPreferred === metadata.title?.native ? "ja" : "und"],
        ...(metadata.synonyms ?? []).map((name) => [name, "und"])]) {
        const candidate = row(id, name, "anilist", null);
        if (candidate) entries.set(`${candidate.scope}:${candidate.anilist_id}:${candidate.normalized_alias}`, { ...candidate, language });
      }
      // Historical library titles have no provenance: keep them private to the owner.
      for (const [name, nameLanguage] of [[item.title, item.title_is_custom ? language(item.title ?? "") : "und"],
        [item.title_chinese, language(item.title_chinese ?? "")], [item.title_japanese, "ja"],
        [item.title_english, "en"], [item.original_title, "und"]]) {
        const candidate = row(id, name, "library-backfill", item.user_id);
        if (candidate) entries.set(`${candidate.scope}:${candidate.user_id}:${candidate.anilist_id}:${candidate.normalized_alias}`, { ...candidate, language: nameLanguage });
      }
    }
    aliases += entries.size;
    if (apply && entries.size) {
      const { error: writeError } = await admin.from("anime_search_aliases").upsert([...entries.values()], {
        onConflict: "scope,user_id,anilist_id,normalized_alias", ignoreDuplicates: true,
      });
      if (writeError) throw writeError;
    }
  }
  offset += data.length;
  if (data.length < 100) break;
}
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", examined, verified: accepted, aliasCandidates: aliases }));
