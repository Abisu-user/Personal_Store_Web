import { after, NextRequest, NextResponse } from "next/server";
import {
  getCatalogue,
  getCatalogueTaxonomy,
  getDiscoveryHome,
  getLatestAiredEpisodes,
  getWeeklySchedule,
  type CatalogueFilters,
} from "@/lib/anime/anilist-catalogue";
import { getAnimePreferences } from "@/lib/anime/data";
import { getSecurityContext } from "@/lib/security/activity";
import { hasAdultContentAccess } from "@/lib/security/adult-content";
import { hasUnlockedAdultAccess } from "@/lib/security/adult-unlock";
import { getAdultCatalogueWithAliases } from "@/lib/anime/adult-alias-catalogue";
import { learnVerifiedAdultAnime } from "@/lib/anime/adult-alias-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveFollowingAniListIds, type FollowingIdentityRow } from "@/lib/anime/following-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const seasons = new Set(["WINTER", "SPRING", "SUMMER", "FALL"]);
const formats = new Set(["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL"]);
const statuses = new Set(["RELEASING", "FINISHED", "NOT_YET_RELEASED"]);
const sorts = new Set([
  "POPULARITY_DESC",
  "SEARCH_MATCH",
  "SCORE_DESC",
  "START_DATE_DESC",
  "NEXT_AIRING_EPISODE_DESC",
  "TITLE_ROMAJI",
  "FAVOURITES_DESC",
]);
const safeValue = (value: string | null, accepted: Set<string>) =>
  value && accepted.has(value) ? value : undefined;
const positive = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export async function GET(request: NextRequest) {
  const security = await getSecurityContext();
  if (!security)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const adultRequested = params.get("adult") === "1";
  const includeAdult =
    adultRequested &&
    (await hasAdultContentAccess(security.userId)) &&
    (await getAnimePreferences(security.userId)).adultModeEnabled;
  if (params.get("adult") === "1" && !includeAdult)
    return NextResponse.json(
      { error: "成人內容模式尚未啟用。" },
      { status: 403 },
    );
  if (adultRequested && !(await hasUnlockedAdultAccess(security, request.headers.get("x-adult-unlock"))))
    return NextResponse.json({ error: "請先完成成人區驗證。" }, { status: 403 });
  const timeZoneOffset = Math.max(
    -840,
    Math.min(840, Number(params.get("tzOffset") ?? 0) || 0),
  );
  if (params.get("view") === "home") {
    try {
      return NextResponse.json(await getDiscoveryHome(timeZoneOffset), {
        headers: { "Cache-Control": "private, max-age=900" },
      });
    } catch (cause) {
      return NextResponse.json(
        {
          error: cause instanceof Error ? cause.message : "無法取得探索動漫。",
        },
        { status: 503 },
      );
    }
  }
  if (params.get("view") === "following") {
    try {
      const admin = createAdminClient();
      type WatchingRow = FollowingIdentityRow & {
        cover_url: string | null;
        cover_storage_object_id: string | null;
        updated_at: string;
        episodes: number | null;
      };
      const watched: WatchingRow[] = [];
      let hasIdentityColumns = false;
      for (let offset = 0; ; offset += 400) {
        const { data, error: libraryError } = await admin.from("anime_library")
          .select("*")
          .eq("user_id", security.userId)
          .eq("watch_status", "watching")
          .or("is_adult.is.null,is_adult.eq.false")
          .is("deleted_at", null)
          .order("id")
          .range(offset, offset + 399);
        if (libraryError) throw libraryError;
        if (offset === 0 && data?.length) hasIdentityColumns = "anilist_media_id" in data[0]!;
        const batch = (data ?? []).map((row) => ({
          ...row,
          anilist_media_id: "anilist_media_id" in row ? row.anilist_media_id : null,
          anilist_match_checked_at: "anilist_match_checked_at" in row ? row.anilist_match_checked_at : null,
        })) as WatchingRow[];
        watched.push(...batch);
        if (batch.length < 400) break;
      }
      const providerIds = await resolveFollowingAniListIds(security.userId, watched, hasIdentityColumns);
      const latest = await getLatestAiredEpisodes([...providerIds.values()]);
      const items = watched.flatMap((row) => {
        const providerId = providerIds.get(row.id);
        const aired = providerId ? latest.get(providerId) : null;
        if (!aired) return [];
        return [{
          id: row.id,
          title: row.title,
          coverUrl: row.cover_storage_object_id
            ? `/api/anime/library/${row.id}/cover?v=${encodeURIComponent(row.updated_at)}`
            : row.cover_url,
          broadcastStatus: aired.broadcastStatus,
          latestEpisode: aired.episode,
          lastAiredAt: aired.airedAt,
          totalEpisodes: aired.totalEpisodes ?? row.episodes,
        }];
      }).sort((left, right) => right.lastAiredAt - left.lastAiredAt);
      return NextResponse.json({ items, watchingCount: watched.length }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (cause) {
      console.warn("[anime-following] recent episodes unavailable", { error: cause instanceof Error ? cause.message : "unknown" });
      return NextResponse.json({ error: "追番更新暫時無法載入。" }, { status: 503 });
    }
  }
  if (params.get("view") === "schedule") {
    try {
      return NextResponse.json(
        { items: await getWeeklySchedule(timeZoneOffset) },
        { headers: { "Cache-Control": "private, max-age=900" } },
      );
    } catch (cause) {
      return NextResponse.json(
        {
          error:
            cause instanceof Error ? cause.message : "無法取得本週播出時間表。",
        },
        { status: 503 },
      );
    }
  }
  if (params.get("resource") === "taxonomy") {
    try {
      return NextResponse.json(await getCatalogueTaxonomy(), {
        headers: { "Cache-Control": "private, max-age=3600" },
      });
    } catch (cause) {
      return NextResponse.json(
        {
          error: cause instanceof Error ? cause.message : "無法取得動漫分類。",
        },
        { status: 503 },
      );
    }
  }
  const season = safeValue(
    params.get("season"),
    seasons,
  ) as CatalogueFilters["season"];
  const format = safeValue(
    params.get("format"),
    formats,
  ) as CatalogueFilters["format"];
  const status = safeValue(
    params.get("status"),
    statuses,
  ) as CatalogueFilters["status"];
  const sort = safeValue(params.get("sort"), sorts) as CatalogueFilters["sort"];
  const clean = (value: string | null) =>
    value?.trim().slice(0, 80) || undefined;
  const filters: CatalogueFilters = {
    page: positive(params.get("page"), 1),
    perPage: Math.min(30, positive(params.get("perPage"), 20)),
    season,
    seasonYear: params.get("seasonYear")
      ? positive(params.get("seasonYear"), new Date().getFullYear())
      : undefined,
    genre: clean(params.get("genre")),
    tag: clean(params.get("tag")),
    format,
    status,
    minimumScore: ["7", "8", "9"].includes(params.get("minimumScore") ?? "")
      ? Number(params.get("minimumScore"))
      : undefined,
    sort,
    includeAdult,
    search: clean(params.get("search")),
  };
  try {
    const result = includeAdult
      ? await getAdultCatalogueWithAliases(filters, security.userId)
      : await getCatalogue(filters);
    const needingAliasLearning = includeAdult ? result.items.filter((anime) =>
      !anime.aliases?.some((alias) => alias.scope === "global" && alias.source === "anilist") ||
      (anime.verifiedChineseTitle && !anime.aliases?.some((alias) => alias.scope === "global" && alias.source === "bangumi"))) : [];
    if (needingAliasLearning.length) after(() =>
      learnVerifiedAdultAnime(needingAliasLearning).catch((cause) =>
        console.warn("[adult-alias] background learning failed", { error: cause instanceof Error ? cause.name : "unknown" })));
    return NextResponse.json(result, {
      headers: { "Cache-Control": includeAdult ? "private, no-store" : "private, max-age=900" },
    });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "無法取得動漫資料。" },
      { status: 503 },
    );
  }
}
