import type { StorageMetadataReader, StorageObjectLocation } from "./metadata-contract";

export type TransitionalStorageReference = {
  userId: string;
  storageObjectId?: string | null;
  legacy: StorageObjectLocation;
};

/**
 * New rows may resolve through storage_object_id. Existing rows continue to use
 * their unchanged provider/bucket/key fields. A missing metadata row never makes
 * an otherwise valid legacy object unreadable during the transition.
 */
export async function resolveStorageReference(
  metadata: StorageMetadataReader,
  reference: TransitionalStorageReference,
): Promise<StorageObjectLocation> {
  if (reference.storageObjectId) {
    const tracked = await metadata.findOwnedActive(reference.storageObjectId, reference.userId);
    if (tracked) return { provider: tracked.provider, bucket: tracked.bucket, objectKey: tracked.objectKey };
  }

  if (!reference.legacy.objectKey.startsWith(`${reference.userId}/`)) {
    throw new Error("Storage reference is outside the authenticated account prefix.");
  }
  return reference.legacy;
}
