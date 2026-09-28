import "server-only";

import { animeAliasLanguage, animeAliasMatchRank, normalizeAnimeAlias, type AnimeAlias } from "@/lib/anime/anime-alias";
import type { ExternalAnime } from "@/lib/anime/types";
import { createAdminClient } from "@/lib/supabase/admin";

type AliasRow = {
  id: string; anilist_id: number; alias: string; language: string; source: string;
  scope: "global" | "user"; is_verified: boolean; normalized_alias: string;
};

const fields = "id,anilist_id,alias,language,source,scope,is_verified,normalized_alias";
const toAlias = (row: AliasRow): AnimeAlias => ({
  id: row.id, alias: row.alias, language: row.language, source: row.source,
  scope: row.scope, isVerified: row.is_verified,
});

type Lookup = { kind: "ids"; ids: number[] } | { kind: "exact" | "partial"; key: string };

async function scopedRows(userId: string, lookup: Lookup): Promise<AliasRow[]> {
  const admin = createAdminClient();
  const queryFor = (scope: "global" | "user") => {
    let query = admin.from("anime_search_aliases").select(fields).eq("is_adult", true).eq("scope", scope);
    if (scope === "user") query = query.eq("user_id", userId);
    if (lookup.kind === "ids") query = query.in("anilist_id", lookup.ids).limit(500);
    else if (lookup.kind === "exact") query = query.eq("normalized_alias", lookup.key).limit(100);
    else query = query.like("normalized_alias", `%${lookup.key}%`).limit(100);
    return query;
  };
  const [global, user] = await Promise.all([
    queryFor("global"), queryFor("user"),
  ]);
  if (global.error || user.error) throw global.error ?? user.error;
  return [...(global.data ?? []), ...(user.data ?? [])] as AliasRow[];
}

export async function adultAliasesForIds(userId: string, ids: number[]) {
  const unique = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 100);
  const result = new Map<number, AnimeAlias[]>();
  if (!unique.length) return result;
  const rows = await scopedRows(userId, { kind: "ids", ids: unique });
  for (const row of rows) result.set(row.anilist_id, [...(result.get(row.anilist_id) ?? []), toAlias(row)]);
  return result;
}

export async function searchAdultAliases(userId: string, search: string) {
  const key = normalizeAnimeAlias(search);
  if (!key || key.length > 100) return new Map<number, number>();
  // Always fetch exact matches separately so broad partial-result limits cannot hide them.
  const [exact, partial] = await Promise.all([
    scopedRows(userId, { kind: "exact", key }),
    key.length >= 2
      ? scopedRows(userId, { kind: "partial", key })
      : Promise.resolve([]),
  ]);
  const ranked = new Map<number, number>();
  for (const row of [...exact, ...partial]) {
    const rank = animeAliasMatchRank(search, row.alias);
    if (rank) ranked.set(row.anilist_id, Math.max(ranked.get(row.anilist_id) ?? 0, rank));
  }
  return new Map([...ranked.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24));
}

type NewAlias = {
  anilist_id: number; alias: string; normalized_alias: string; language: string;
  source: string; source_reference: string | null; scope: "global" | "user";
  user_id: string | null; is_adult: true; is_verified: boolean;
};

function row(anilistId: number, raw: string, source: string, userId: string | null, sourceReference: string | null = null): NewAlias | null {
  const alias = raw.trim().slice(0, 500);
  const normalized = normalizeAnimeAlias(alias);
  if (!Number.isSafeInteger(anilistId) || anilistId <= 0 || !normalized || normalized.length > 500) return null;
  return {
    anilist_id: anilistId, alias, normalized_alias: normalized,
    language: animeAliasLanguage(alias), source, source_reference: sourceReference,
    scope: userId ? "user" : "global", user_id: userId,
    is_adult: true, is_verified: userId === null,
  };
}

async function insertIgnoringDuplicates(rows: NewAlias[]) {
  if (!rows.length) return;
  const { error } = await createAdminClient().from("anime_search_aliases")
    .upsert(rows, { onConflict: "scope,user_id,anilist_id,normalized_alias", ignoreDuplicates: true });
  if (error) throw error;
}

/** Call only with metadata resolved from the exact AniList ID. */
export async function learnVerifiedAdultAnime(items: ExternalAnime[]) {
  const rows: NewAlias[] = [];
  for (const anime of items) {
    if (anime.source !== "anilist" || !anime.isAdult || anime.countryOfOrigin !== "JP" || !/^\d+$/.test(anime.id)) continue;
    const id = Number(anime.id);
    const names: Array<[string | null | undefined, string]> = [
      [anime.title, anime.title === anime.titleJapanese ? "ja" : "und"],
      [anime.originalTitle, "und"], [anime.titleEnglish, "en"],
      [anime.titleJapanese, "ja"],
      [anime.titleUserPreferred, anime.titleUserPreferred === anime.titleJapanese ? "ja" : "und"],
      ...(anime.synonyms ?? []).map((name): [string, string] => [name, "und"]),
    ];
    for (const [name, language] of names) {
      if (!name?.trim()) continue;
      const entry = row(id, name, "anilist", null);
      if (entry) rows.push({ ...entry, language });
    }
    // Bangumi names are verified only when its explicit MAL ID matched AniList.
    if (anime.verifiedChineseTitle && anime.titleChinese) {
      const entry = row(id, anime.titleChinese, "bangumi", null, anime.verifiedChineseSource ?? null);
      if (entry) rows.push(entry);
    }
  }
  const distinct = new Map(rows.map((entry) => [`${entry.anilist_id}:${entry.normalized_alias}`, entry]));
  await insertIgnoringDuplicates([...distinct.values()].slice(0, 400));
}

export async function addUserAdultAlias(userId: string, anilistId: number, alias: string) {
  const entry = row(anilistId, alias, "user", userId);
  if (!entry) throw new Error("Invalid alias");
  await insertIgnoringDuplicates([entry]);
}

export async function removeUserAdultAlias(userId: string, aliasId: string) {
  const { data, error } = await createAdminClient().from("anime_search_aliases").delete()
    .eq("id", aliasId).eq("user_id", userId).eq("scope", "user").eq("is_adult", true)
    .select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
