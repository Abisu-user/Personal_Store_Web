export type FileCategory = { id: string; name: string; sort_order: number };
export type FileTag = { id: string; name: string; color: string | null };
import type { FolderLockStatus } from "@/lib/folder-locks/types";
export type FileFolder = { id: string; name: string; sort_order: number; is_visible: boolean } & FolderLockStatus;
export type StoredFile = { id: string; title: string; description: string | null; originalFilename: string; mimeType: string; byteSize: number; favorite: boolean; pinned: boolean; archived: boolean; deletedAt: string | null; folder: Pick<FileFolder, "id" | "name" | "is_visible"> | null; coverImageUrl: string | null; category: Pick<FileCategory, "id" | "name"> | null; tags: FileTag[]; updatedAt: string };
export type FilesWorkspaceData = { files: StoredFile[]; categories: FileCategory[]; folders: FileFolder[]; tags: FileTag[] };
