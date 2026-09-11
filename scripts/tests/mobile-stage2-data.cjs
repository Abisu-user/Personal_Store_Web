/* Isolated layout fixtures; never imported by production. */
const folders = Array.from({ length: 12 }, (_, i) => ({ id: "folder" + i, name: i === 2 ? "很長的資料夾名稱也不應超出畫面" : "資料夾" + i, scope: "standard", sortOrder: i, isVisible: true, sort_order: i, is_visible: true }));
const tags = Array.from({ length: 24 }, (_, i) => ({ id: "cat" + i, name: i === 3 ? "中文長分類名稱測試" : "類別" + i, color: null, folderId: null, sortOrder: i, folder_id: null, sort_order: i }));
const timestamp = "2026-09-10T06:00:00Z";
const anime = {
  library: Array.from({ length: 36 }, (_, i) => ({
    id: "anime" + i, externalId: String(i), externalSource: "manual",
    title: "測試作品" + i, titleChinese: "測試作品" + i, titleJapanese: null, titleEnglish: null, originalTitle: null,
    coverUrl: "/covers/" + i + ".svg", bannerUrl: null, synopsis: "隔離測試資料",
    animeType: "TV", broadcastStatus: "FINISHED", episodes: i === 2 ? null : 12, episodeDuration: 24, releaseYear: 2026, season: null,
    startDate: null, endDate: null, ageRating: null, sourceMaterial: null, publicScore: 8, genres: [], studios: [], relations: [],
    watchStatus: ["planning", "watching", "completed", "dropped"][i % 4], watchedEpisodes: i % 4 === 2 ? 12 : i % 7,
    rating: 8, favorite: false, personalRank: "normal", notes: null, startedWatchingAt: null, completedAt: null,
    lastWatchedAt: null, createdAt: timestamp, updatedAt: timestamp, tags: [tags[i % 5]], sourceUrl: null, isAdult: false,
    contentRating: null, adultSource: null, externalUrl: null, folderId: null, folderIds: i % 3 === 0 ? ["folder1"] : [],
  })),
  tags, folders, logs: [],
  preferences: { adultModeEnabled: false, adultHiddenByDefault: true, adultAccessMode: "none", blurAdultCovers: true },
  adultPermissions: { adultContentAccess: false, adultContentAdmin: false },
};
const bookmarks = {
  bookmarks: Array.from({ length: 15 }, (_, i) => ({
    id: "bookmark" + i, title: "網站測試" + i, description: "真實元件的隔離測試內容", favorite: i === 0, pinned: i === 0,
    archived: false, deletedAt: null, createdAt: timestamp, updatedAt: timestamp, coverImageUrl: "/covers/" + i + ".svg",
    category: tags[i % 5], folder: i >= 10 ? folders[i % 3] : null,
    detail: { url: "https://example.com/" + i, favicon_url: null, site_title: null, notes: null }, tags: [],
  })),
  categories: tags, folders, tags: [],
};
module.exports = { anime, bookmarks };
