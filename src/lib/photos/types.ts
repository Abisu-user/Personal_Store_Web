export type PhotoCategory = { id: string; name: string; sort_order: number };
export type PhotoFolder = { id: string; name: string; sort_order: number; is_visible: boolean };

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
  category: Pick<PhotoCategory, "id" | "name"> | null;
  imageUrl: string;
  updatedAt: string;
};

export type PhotosWorkspaceData = { photos: StoredPhoto[]; categories: PhotoCategory[]; folders: PhotoFolder[] };
