export type AnimeWatchStatus = "planning" | "watching" | "completed" | "paused" | "dropped";
export type AnimePersonalRank = "normal" | "like" | "love" | "masterpiece";

// The backing table keeps its original `anime_tags` name for backwards
// compatibility.  In the product these are categories, not free-form tags.
export type AnimeFolder = { id: string; name: string; scope: "standard" | "adult"; sortOrder: number; isVisible: boolean };
export type AnimeTag = { id: string; name: string; color: string | null; folderId: string | null; sortOrder: number };
export type AnimeRelation = { relation: string; malId: number; title: string; type: string | null };

export type AnimeLibraryItem = {
  id: string; externalId: string; externalSource: "jikan" | "anilist" | "bangumi" | "manual"; title: string; titleJapanese: string | null; titleEnglish: string | null; titleChinese: string | null;
  originalTitle: string | null; coverUrl: string | null; bannerUrl: string | null; synopsis: string | null; animeType: string | null; broadcastStatus: string | null;
  episodes: number | null; episodeDuration: number | null; releaseYear: number | null; season: string | null; startDate: string | null; endDate: string | null;
  ageRating: string | null; sourceMaterial: string | null; publicScore: number | null; genres: string[]; studios: string[]; relations: AnimeRelation[];
  watchStatus: AnimeWatchStatus; watchedEpisodes: number; rating: number | null; favorite: boolean; personalRank: AnimePersonalRank | null; notes: string | null;
  startedWatchingAt: string | null; completedAt: string | null; lastWatchedAt: string | null; createdAt: string; updatedAt: string; tags: AnimeTag[];
  sourceUrl: string | null;
  isAdult: boolean; contentRating: string | null; adultSource: string | null; externalUrl: string | null;
  /** `folderId` remains the legacy primary folder; `folderIds` is authoritative. */
  folderId: string | null; folderIds: string[];
};

export type AnimeWatchLog = { id: string; animeId: string; fromEpisode: number; toEpisode: number; action: "set" | "increment" | "decrement"; watchedAt: string };
export type AdultAccessMode = "none" | "passkey" | "pin4" | "pin6";
export type AnimePreferences = { adultModeEnabled: boolean; adultHiddenByDefault: boolean; adultAccessMode: AdultAccessMode; blurAdultCovers: boolean; };
export type AnimeWorkspaceData = { library: AnimeLibraryItem[]; tags: AnimeTag[]; folders: AnimeFolder[]; logs: AnimeWatchLog[]; preferences: AnimePreferences; };

export type ExternalAnime = {
  id: string; source: "jikan" | "anilist" | "bangumi"; title: string; titleJapanese: string | null; titleEnglish: string | null; titleChinese: string | null; originalTitle: string | null;
  coverUrl: string | null; bannerUrl: string | null; synopsis: string | null; animeType: string | null; broadcastStatus: string | null; episodes: number | null;
  episodeDuration: number | null; releaseYear: number | null; season: string | null; startDate: string | null; endDate: string | null; ageRating: string | null;
  sourceMaterial: string | null; publicScore: number | null; genres: string[]; studios: string[]; relations: AnimeRelation[];
  isAdult: boolean; contentRating: string | null; externalUrl: string | null;
};

export const animeStatusLabels: Record<AnimeWatchStatus, string> = { planning: "想看", watching: "正在觀看", completed: "已看完", paused: "暫停", dropped: "棄番" };
