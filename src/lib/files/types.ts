export type FileCategory = { id: string; name: string; sort_order: number };
export type FileTag = { id: string; name: string; color: string | null };
export type StoredFile = { id: string; title: string; description: string | null; originalFilename: string; mimeType: string; byteSize: number; category: Pick<FileCategory, "id" | "name"> | null; tags: FileTag[]; updatedAt: string };
export type FilesWorkspaceData = { files: StoredFile[]; categories: FileCategory[]; tags: FileTag[] };
