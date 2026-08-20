export type BookmarkCategory = { id: string; name: string; sort_order: number };
export type BookmarkTag = { id: string; name: string; color: string | null };
export type Bookmark = {
  id: string;
  title: string;
  description: string | null;
  favorite: boolean;
  pinned: boolean;
  archived: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: Pick<BookmarkCategory, "id" | "name"> | null;
  detail: { url: string; favicon_url: string | null; site_title: string | null; notes: string | null } | null;
  tags: BookmarkTag[];
};

export type BookmarksWorkspaceData = {
  bookmarks: Bookmark[];
  categories: BookmarkCategory[];
  tags: BookmarkTag[];
};
