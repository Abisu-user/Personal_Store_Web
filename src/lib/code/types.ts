export type CodeCategory = { id: string; name: string; sort_order: number };
export type CodeTag = { id: string; name: string; color: string | null };
export type CodeFolder = { id: string; name: string; sort_order: number; is_visible: boolean };

export type CodeSnippet = {
  id: string;
  title: string;
  description: string | null;
  language: string;
  sourceCode: string;
  favorite: boolean;
  pinned: boolean;
  archived: boolean;
  deletedAt: string | null;
  folder: Pick<CodeFolder, "id" | "name" | "is_visible"> | null;
  coverImageUrl: string | null;
  category: Pick<CodeCategory, "id" | "name"> | null;
  tags: CodeTag[];
  updatedAt: string;
};

export type CodeWorkspaceData = { snippets: CodeSnippet[]; categories: CodeCategory[]; folders: CodeFolder[]; tags: CodeTag[] };
