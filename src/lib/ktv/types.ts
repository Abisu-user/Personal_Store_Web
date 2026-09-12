export type KtvCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type KtvSong = {
  id: string;
  songNumber: string;
  title: string;
  artist: string;
  category: Pick<KtvCategory, "id" | "name"> | null;
  createdAt: string;
  updatedAt: string;
};

export type KtvWorkspaceData = {
  songs: KtvSong[];
  categories: KtvCategory[];
};
