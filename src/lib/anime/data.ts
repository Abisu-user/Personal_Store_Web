import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnimeFolder, AnimeLibraryItem, AnimePreferences, AnimeRelation, AnimeTag, AnimeWatchLog, AnimeWorkspaceData } from "@/lib/anime/types";
import { localizeAnimeTitles } from "@/lib/anime/bangumi-title-localizer";

const asStrings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const asRelations = (value: unknown): AnimeRelation[] => Array.isArray(value) ? value.filter((item): item is AnimeRelation => Boolean(item) && typeof item === "object" && typeof (item as AnimeRelation).malId === "number" && typeof (item as AnimeRelation).title === "string") : [];

const toAnime = (row: any): AnimeLibraryItem => ({
  id: row.id, externalId: row.external_id, externalSource: row.external_source, title: row.title, titleJapanese: row.title_japanese, titleEnglish: row.title_english, titleChinese: row.title_chinese, originalTitle: row.original_title,
  coverUrl: row.cover_url, bannerUrl: row.banner_url, synopsis: row.synopsis, animeType: row.anime_type, broadcastStatus: row.broadcast_status, episodes: row.episodes, episodeDuration: row.episode_duration, releaseYear: row.release_year, season: row.season, startDate: row.start_date, endDate: row.end_date, ageRating: row.age_rating, sourceMaterial: row.source_material, publicScore: row.public_score === null ? null : Number(row.public_score), genres: asStrings(row.genres), studios: asStrings(row.studios), relations: asRelations(row.relations), watchStatus: row.watch_status, watchedEpisodes: row.watched_episodes, rating: row.rating === null ? null : Number(row.rating), favorite: row.favorite, personalRank: row.personal_rank, notes: row.notes, startedWatchingAt: row.started_watching_at, completedAt: row.completed_at, lastWatchedAt: row.last_watched_at, createdAt: row.created_at, updatedAt: row.updated_at, tags: [], sourceUrl: row.source_url, isAdult: Boolean(row.is_adult), contentRating: row.content_rating ?? null, adultSource: row.adult_source ?? null, externalUrl: row.external_url ?? null, folderId: row.folder_id ?? null,
});

export const defaultAnimePreferences: AnimePreferences = { adultModeEnabled: false, adultHiddenByDefault: true, adultAccessMode: "none", blurAdultCovers: true };

function toPreferences(row: any): AnimePreferences {
  if (!row) return defaultAnimePreferences;
  const accessMode = row.adult_access_mode;
  return { adultModeEnabled: Boolean(row.adult_mode_enabled), adultHiddenByDefault: row.adult_hidden_by_default !== false, adultAccessMode: accessMode === "passkey" || accessMode === "pin4" || accessMode === "pin6" ? accessMode : row.require_adult_passkey ? "passkey" : "none", blurAdultCovers: row.blur_adult_covers !== false };
}

export async function getAnimePreferences(userId: string): Promise<AnimePreferences> {
  const { data, error } = await createAdminClient().from("anime_preferences").select("adult_mode_enabled,adult_hidden_by_default,require_adult_passkey,blur_adult_covers,adult_access_mode").eq("user_id", userId).maybeSingle();
  // Allows the ordinary Anime Library to continue working until this additive
  // migration is applied; adult mode remains securely off in that situation.
  if (error) return defaultAnimePreferences;
  return toPreferences(data);
}

export async function getAnimeWorkspaceData(userId: string, scope: "standard" | "adult" = "standard"): Promise<AnimeWorkspaceData> {
  const admin = createAdminClient();
  const preferences = await getAnimePreferences(userId);
  let libraryQuery = admin.from("anime_library").select("*").eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(400);
  libraryQuery = scope === "adult" ? libraryQuery.eq("is_adult", true) : libraryQuery.or("is_adult.is.null,is_adult.eq.false");
  let { data: rows, error: libraryError } = await libraryQuery;
  // Deploying the UI ahead of the additive migration must not take the
  // existing library offline. Before the column exists, every legacy row is
  // treated as ordinary content and adult mode remains unavailable.
  if (libraryError && scope === "standard") {
    const legacy = await admin.from("anime_library").select("*").eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(400);
    rows = legacy.data; libraryError = legacy.error;
  }
  let [{ data: tagRows, error: tagError }, { data: folderRows, error: folderError }] = await Promise.all([
    admin.from("anime_tags").select("id,name,color,folder_id").eq("user_id", userId).eq("scope", scope).order("name").limit(100),
    admin.from("anime_folders").select("id,name,scope,sort_order,is_visible").eq("user_id", userId).eq("scope", scope).order("sort_order").limit(100),
  ]);
  // The folder migration is additive.  Keep the existing Anime Library
  // readable while a production project is waiting for that migration.
  if (tagError) {
    const legacyTags = await admin.from("anime_tags").select("id,name,color").eq("user_id", userId).eq("scope", scope).order("name").limit(100);
    tagRows = legacyTags.data?.map((tag) => ({ ...tag, folder_id: null })) ?? null;
    tagError = legacyTags.error;
  }
  if (folderError) { folderRows = []; folderError = null; }
  if (libraryError || tagError) throw new Error("Anime library unavailable");
  const library = await localizeAnimeTitles((rows ?? []).map(toAnime)); const animeIds = library.map((anime) => anime.id);
  const [{ data: links, error: linkError }, { data: logRows, error: logError }] = await Promise.all([
    animeIds.length ? admin.from("anime_library_tags").select("anime_id,tag_id").in("anime_id", animeIds) : Promise.resolve({ data: [], error: null }),
    animeIds.length ? admin.from("anime_watch_logs").select("id,anime_id,from_episode,to_episode,action,watched_at").eq("user_id", userId).in("anime_id", animeIds).order("watched_at", { ascending: false }).limit(120) : Promise.resolve({ data: [], error: null }),
  ]);
  if (linkError || logError) throw new Error("Anime tags unavailable");
  const tags = (tagRows ?? []).map((row: any): AnimeTag => ({ id: row.id, name: row.name, color: row.color, folderId: row.folder_id ?? null }));
  const folders = (folderRows ?? []).map((row: any): AnimeFolder => ({ id: row.id, name: row.name, scope: row.scope, sortOrder: row.sort_order, isVisible: row.is_visible }));
  const tagById = new Map(tags.map((tag) => [tag.id, tag])); const animeById = new Map(library.map((anime) => [anime.id, anime]));
  (links ?? []).forEach((link: any) => { const tag = tagById.get(link.tag_id); if (tag) animeById.get(link.anime_id)?.tags.push(tag); });
  const logs = (logRows ?? []).map((row: any): AnimeWatchLog => ({ id: row.id, animeId: row.anime_id, fromEpisode: row.from_episode, toEpisode: row.to_episode, action: row.action, watchedAt: row.watched_at }));
  return { library, tags, folders, logs, preferences };
}
