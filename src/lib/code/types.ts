export type CodeCategory = { id: string; name: string; sort_order: number; folder_id: string | null };
export type CodeTag = { id: string; name: string; color: string | null };
import type { FolderLockStatus } from "@/lib/folder-locks/types";
export type CodeFolder = { id: string; name: string; sort_order: number; is_visible: boolean } & FolderLockStatus;

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
  folders: Pick<CodeFolder, "id" | "name" | "is_visible">[];
  coverImageUrl: string | null;
  category: Pick<CodeCategory, "id" | "name"> | null;
  categories: Pick<CodeCategory, "id" | "name">[];
  tags: CodeTag[];
  updatedAt: string;
};

export type CodeWorkspaceData = { snippets: CodeSnippet[]; categories: CodeCategory[]; folders: CodeFolder[]; tags: CodeTag[] };
