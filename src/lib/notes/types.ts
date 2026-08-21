export type NoteCategory = { id: string; name: string; sort_order: number };
export type NoteTag = { id: string; name: string; color: string | null };
export type NoteFolder = { id: string; name: string; sort_order: number; is_visible: boolean };

export type Note = {
  id: string;
  title: string;
  description: string | null;
  content: string;
  currentVersion: number;
  favorite: boolean;
  pinned: boolean;
  archived: boolean;
  deletedAt: string | null;
  folder: Pick<NoteFolder, "id" | "name" | "is_visible"> | null;
  coverImageUrl: string | null;
  category: Pick<NoteCategory, "id" | "name"> | null;
  tags: NoteTag[];
  updatedAt: string;
};

export type NotesWorkspaceData = {
  notes: Note[];
  categories: NoteCategory[];
  folders: NoteFolder[];
  tags: NoteTag[];
};
