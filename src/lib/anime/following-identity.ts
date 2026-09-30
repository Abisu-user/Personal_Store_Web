import "server-only";
import { findAniListMediaIdByAliases, getAniListIdsForMalIds } from "@/lib/anime/anilist-catalogue";
import { createAdminClient } from "@/lib/supabase/admin";

export type FollowingIdentityRow = {
  id: string;
  title: string;
  title_japanese: string | null;
  title_english: string | null;
  title_chinese: string | null;
  original_title: string | null;
  release_year: number | null;
  external_source: string;
  external_id: string;
  anilist_media_id: number | null;
  anilist_match_checked_at: string | null;
};

const BANGUMI_ROOT = (process.env.ANIME_BANGUMI_API_URL || "https://api.bgm.tv/v0").replace(/\/+$/, "");
const NO_MATCH_RECHECK_MS = 24 * 60 * 60 * 1000;

async function bangumiAliases(subjectId: string): Promise<string[]> {
  if (!/^\d{1,10}$/.test(subjectId)) return [];
  const response = await fetch(`${BANGUMI_ROOT}/subjects/${subjectId}`, {
    headers: { Accept: "application/json", "User-Agent": "Personal-Vault/1.0 (anime identity backfill)" },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Bangumi identity returned ${response.status}`);
  const subject = await response.json() as {
    name?: string;
    name_cn?: string;
    infobox?: Array<{ key?: string; value?: string | Array<{ v?: string }> }>;
  };
  const aliases = [subject.name, subject.name_cn];
  for (const field of subject.infobox ?? []) {
    if (!field.key || !/^(?:别名|別名|英文名|日文名)$/.test(field.key)) continue;
    if (typeof field.value === "string") aliases.push(field.value);
    else if (Array.isArray(field.value)) aliases.push(...field.value.map((item) => item.v));
  }
  return aliases.filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0);
}

export async function resolveFollowingAniListIds(
  userId: string,
  rows: FollowingIdentityRow[],
  persistMatches: boolean,
): Promise<Map<string, number>> {
  const resolved = new Map<string, number>();
  const pendingMal = rows.filter((row) => !row.anilist_media_id && row.external_source === "jikan" && /^\d+$/.test(row.external_id));
  let malIds = new Map<number, number>();
  if (pendingMal.length) {
    try {
      malIds = await getAniListIdsForMalIds(pendingMal.map((row) => Number(row.external_id)));
    } catch (cause) {
      console.warn("[anime-following] MAL ID lookup unavailable", { error: cause instanceof Error ? cause.message : "unknown" });
    }
  }
  const admin = persistMatches ? createAdminClient() : null;
  const save = async (row: FollowingIdentityRow, anilistId: number | null) => {
    if (!admin) return;
    const { error } = await admin.from("anime_library")
      .update({ anilist_media_id: anilistId, anilist_match_checked_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("user_id", userId)
      .eq("external_source", row.external_source)
      .eq("external_id", row.external_id)
      .eq("watch_status", "watching")
      .or("is_adult.is.null,is_adult.eq.false")
      .is("anilist_media_id", null)
      .is("deleted_at", null);
    if (error) console.warn("[anime-following] identity backfill not saved", { animeId: row.id, error: error.message });
  };
  const jobs = rows.map(async (row) => {
    const stored = Number(row.anilist_media_id);
    if (Number.isSafeInteger(stored) && stored > 0) {
      resolved.set(row.id, stored);
      return;
    }
    if (row.external_source === "anilist") {
      const id = Number(row.external_id);
      if (Number.isSafeInteger(id) && id > 0) {
        resolved.set(row.id, id);
        await save(row, id);
      }
      return;
    }
    if (row.external_source === "jikan") {
      const id = malIds.get(Number(row.external_id));
      if (id) {
        resolved.set(row.id, id);
        await save(row, id);
      }
      return;
    }
    if (row.external_source !== "manual" && row.external_source !== "bangumi") return;
    const checkedAt = row.anilist_match_checked_at ? Date.parse(row.anilist_match_checked_at) : NaN;
    if (Number.isFinite(checkedAt) && Date.now() - checkedAt < NO_MATCH_RECHECK_MS) return;
    const titles = [row.title_japanese, row.title_english, row.original_title, row.title_chinese, row.title]
      .filter((title): title is string => typeof title === "string" && title.trim().length > 0);
    let id = await findAniListMediaIdByAliases(titles, row.release_year);
    if (!id && row.external_source === "bangumi") {
      id = await findAniListMediaIdByAliases(await bangumiAliases(row.external_id), row.release_year);
    }
    if (id) resolved.set(row.id, id);
    await save(row, id);
  });
  const outcomes = await Promise.allSettled(jobs);
  outcomes.forEach((result, index) => {
    if (result.status === "rejected") console.warn("[anime-following] identity lookup unavailable", {
      animeId: rows[index]?.id,
      error: result.reason instanceof Error ? result.reason.message : "unknown",
    });
  });
  return resolved;
}
