export type NoteCategory = { id: string; name: string; sort_order: number };
export type NoteTag = { id: string; name: string; color: string | null };

export type Note = {
  id: string;
  title: string;
  description: string | null;
  content: string;
  currentVersion: number;
  category: Pick<NoteCategory, "id" | "name"> | null;
  tags: NoteTag[];
  updatedAt: string;
};

export type NotesWorkspaceData = {
  notes: Note[];
  categories: NoteCategory[];
  tags: NoteTag[];
};
