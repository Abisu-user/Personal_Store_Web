import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnimeLibraryItem, AnimeRelation, AnimeTag, AnimeWatchLog, AnimeWorkspaceData } from "@/lib/anime/types";

const asStrings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const asRelations = (value: unknown): AnimeRelation[] => Array.isArray(value) ? value.filter((item): item is AnimeRelation => Boolean(item) && typeof item === "object" && typeof (item as AnimeRelation).malId === "number" && typeof (item as AnimeRelation).title === "string") : [];

const toAnime = (row: any): AnimeLibraryItem => ({
  id: row.id, externalId: row.external_id, externalSource: row.external_source, title: row.title, titleJapanese: row.title_japanese, titleEnglish: row.title_english, titleChinese: row.title_chinese, originalTitle: row.original_title,
  coverUrl: row.cover_url, bannerUrl: row.banner_url, synopsis: row.synopsis, animeType: row.anime_type, broadcastStatus: row.broadcast_status, episodes: row.episodes, episodeDuration: row.episode_duration, releaseYear: row.release_year, season: row.season, startDate: row.start_date, endDate: row.end_date, ageRating: row.age_rating, sourceMaterial: row.source_material, publicScore: row.public_score === null ? null : Number(row.public_score), genres: asStrings(row.genres), studios: asStrings(row.studios), relations: asRelations(row.relations), watchStatus: row.watch_status, watchedEpisodes: row.watched_episodes, rating: row.rating === null ? null : Number(row.rating), favorite: row.favorite, personalRank: row.personal_rank, notes: row.notes, startedWatchingAt: row.started_watching_at, completedAt: row.completed_at, lastWatchedAt: row.last_watched_at, createdAt: row.created_at, updatedAt: row.updated_at, tags: [], sourceUrl: row.source_url,
});

export async function getAnimeWorkspaceData(userId: string): Promise<AnimeWorkspaceData> {
  const admin = createAdminClient();
  const [{ data: rows, error: libraryError }, { data: tagRows, error: tagError }, { data: logRows, error: logError }] = await Promise.all([
    admin.from("anime_library").select("*").eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(400),
    admin.from("anime_tags").select("id,name,color").eq("user_id", userId).order("name").limit(100),
    admin.from("anime_watch_logs").select("id,anime_id,from_episode,to_episode,action,watched_at").eq("user_id", userId).order("watched_at", { ascending: false }).limit(120),
  ]);
  if (libraryError || tagError || logError) throw new Error("Anime library unavailable");
  const library = (rows ?? []).map(toAnime); const animeIds = library.map((anime) => anime.id);
  const { data: links, error: linkError } = animeIds.length ? await admin.from("anime_library_tags").select("anime_id,tag_id").in("anime_id", animeIds) : { data: [], error: null };
  if (linkError) throw new Error("Anime tags unavailable");
  const tags = (tagRows ?? []).map((row: any): AnimeTag => ({ id: row.id, name: row.name, color: row.color }));
  const tagById = new Map(tags.map((tag) => [tag.id, tag])); const animeById = new Map(library.map((anime) => [anime.id, anime]));
  (links ?? []).forEach((link: any) => { const tag = tagById.get(link.tag_id); if (tag) animeById.get(link.anime_id)?.tags.push(tag); });
  const logs = (logRows ?? []).map((row: any): AnimeWatchLog => ({ id: row.id, animeId: row.anime_id, fromEpisode: row.from_episode, toEpisode: row.to_episode, action: row.action, watchedAt: row.watched_at }));
  return { library, tags, logs };
}
