export type StorageProviderName = "supabase" | "r2" | "b2";
export type StorageObjectStatus = "pending" | "active" | "deleting" | "failed";

export type StorageObjectMetadata = {
  id: string;
  userId: string;
  provider: StorageProviderName;
  bucket: string;
  objectKey: string;
  category: string;
  byteSize: number | null;
  mimeType: string | null;
  checksum: string | null;
  status: StorageObjectStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type StorageObjectLocation = Pick<StorageObjectMetadata, "provider" | "bucket" | "objectKey">;

export type CreatePendingStorageObject = StorageObjectLocation & {
  userId: string;
  category: string;
  byteSize?: number | null;
  mimeType?: string | null;
  checksum?: string | null;
};

export type ActivateStorageObject = {
  id: string;
  userId: string;
  byteSize: number;
  mimeType?: string | null;
  checksum?: string | null;
};

export interface StorageMetadataReader {
  findOwnedActive(id: string, userId: string): Promise<StorageObjectMetadata | null>;
  findOwnedPending(id: string, userId: string): Promise<StorageObjectMetadata | null>;
}

export interface StorageMetadataWriter extends StorageMetadataReader {
  createPending(input: CreatePendingStorageObject): Promise<StorageObjectMetadata>;
  activateOwned(input: ActivateStorageObject): Promise<StorageObjectMetadata>;
  markFailed(id: string, userId: string): Promise<void>;
}
