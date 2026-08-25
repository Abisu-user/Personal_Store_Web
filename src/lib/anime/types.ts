export type AnimeWatchStatus = "planning" | "watching" | "completed" | "paused" | "dropped";
export type AnimePersonalRank = "normal" | "like" | "love" | "masterpiece";

export type AnimeTag = { id: string; name: string; color: string | null };
export type AnimeRelation = { relation: string; malId: number; title: string; type: string | null };

export type AnimeLibraryItem = {
  id: string; externalId: string; externalSource: "jikan"; title: string; titleJapanese: string | null; titleEnglish: string | null; titleChinese: string | null;
  originalTitle: string | null; coverUrl: string | null; bannerUrl: string | null; synopsis: string | null; animeType: string | null; broadcastStatus: string | null;
  episodes: number | null; episodeDuration: number | null; releaseYear: number | null; season: string | null; startDate: string | null; endDate: string | null;
  ageRating: string | null; sourceMaterial: string | null; publicScore: number | null; genres: string[]; studios: string[]; relations: AnimeRelation[];
  watchStatus: AnimeWatchStatus; watchedEpisodes: number; rating: number | null; favorite: boolean; personalRank: AnimePersonalRank | null; notes: string | null;
  startedWatchingAt: string | null; completedAt: string | null; lastWatchedAt: string | null; createdAt: string; updatedAt: string; tags: AnimeTag[];
};

export type AnimeWatchLog = { id: string; animeId: string; fromEpisode: number; toEpisode: number; action: "set" | "increment" | "decrement"; watchedAt: string };
export type AnimeWorkspaceData = { library: AnimeLibraryItem[]; tags: AnimeTag[]; logs: AnimeWatchLog[] };

export type ExternalAnime = {
  id: string; title: string; titleJapanese: string | null; titleEnglish: string | null; titleChinese: string | null; originalTitle: string | null;
  coverUrl: string | null; bannerUrl: string | null; synopsis: string | null; animeType: string | null; broadcastStatus: string | null; episodes: number | null;
  episodeDuration: number | null; releaseYear: number | null; season: string | null; startDate: string | null; endDate: string | null; ageRating: string | null;
  sourceMaterial: string | null; publicScore: number | null; genres: string[]; studios: string[]; relations: AnimeRelation[];
};

export const animeStatusLabels: Record<AnimeWatchStatus, string> = { planning: "想看", watching: "正在觀看", completed: "已看完", paused: "暫停", dropped: "棄番" };
