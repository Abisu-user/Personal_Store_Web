export type PhotoCategory = { id: string; name: string; sort_order: number; folder_id: string | null };
import type { FolderLockStatus } from "@/lib/folder-locks/types";
export type PhotoFolder = { id: string; name: string; sort_order: number; is_visible: boolean } & FolderLockStatus;

export type StoredPhoto = {
  id: string;
  title: string;
  description: string | null;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  favorite: boolean;
  pinned: boolean;
  archived: boolean;
  deletedAt: string | null;
  folder: Pick<PhotoFolder, "id" | "name" | "is_visible"> | null;
  folders: Pick<PhotoFolder, "id" | "name" | "is_visible">[];
  category: Pick<PhotoCategory, "id" | "name"> | null;
  categories: Pick<PhotoCategory, "id" | "name">[];
  imageUrl: string;
  updatedAt: string;
};

export type PhotosWorkspaceData = { photos: StoredPhoto[]; categories: PhotoCategory[]; folders: PhotoFolder[] };
