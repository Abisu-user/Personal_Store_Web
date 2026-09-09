import "server-only";

import { createB2StorageManager } from "./b2-server";
import type { StorageManager } from "./manager";
import type { StorageMetadataWriter, StorageProviderName } from "./metadata-contract";
import { createStorageMetadataRepository } from "./metadata-repository";

type DeleteManager = Pick<StorageManager, "delete">;

type CleanupDependencies = {
  metadata?: StorageMetadataWriter;
  managers?: Partial<Record<StorageProviderName, DeleteManager>>;
  limit?: number;
};

export type PendingCleanupReport = {
  claimed: number;
  deleted: number;
  retryableFailures: number;
};

function defaultManagers(): Partial<Record<StorageProviderName, DeleteManager>> {
  return { b2: createB2StorageManager() };
}

export async function cleanupPendingStorageObjects(
  dependencies: CleanupDependencies = {},
): Promise<PendingCleanupReport> {
  const metadata = dependencies.metadata ?? createStorageMetadataRepository();
  const managers = dependencies.managers ?? defaultManagers();
  const claimed = await metadata.claimExpired(dependencies.limit ?? 25);

  const results = await Promise.all(claimed.map(async (object) => {
    const manager = managers[object.provider];
    if (!manager) {
      await metadata.finishCleanup(object.id, false, "Storage provider cleanup is not configured.");
      return false;
    }

    const { error } = await manager.delete(object.bucket, [object.objectKey]);
    if (error) {
      await metadata.finishCleanup(object.id, false, "Provider object deletion failed.");
      return false;
    }

    await metadata.finishCleanup(object.id, true);
    return true;
  }));

  const deleted = results.filter(Boolean).length;
  return {
    claimed: claimed.length,
    deleted,
    retryableFailures: claimed.length - deleted,
  };
}
