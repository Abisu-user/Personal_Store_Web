import type { StorageProvider } from "./provider";

const storagePageSize = 100;
const storageDeleteBatchSize = 100;
const maximumStorageDepth = 12;
type CleanupStorage = Pick<StorageProvider, "list" | "listBuckets" | "delete">;

async function listOwnedObjects(storage: CleanupStorage, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > maximumStorageDepth) throw new Error(`Storage path nesting is too deep in ${bucket}.`);
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.list(bucket, prefix, {
      limit: storagePageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const items = data ?? [];

    for (const item of items) {
      const path = `${prefix}/${item.name}`;
      if (item.id) paths.push(path);
      else paths.push(...await listOwnedObjects(storage, bucket, path, depth + 1));
    }

    if (items.length < storagePageSize) break;
    offset += items.length;
  }

  return paths;
}

/** Existing account deletion algorithm: collect all pages before removing any objects. */
export async function removeOwnedStorage(storage: CleanupStorage, userId: string) {
  const { data: buckets, error } = await storage.listBuckets();
  if (error) throw error;

  for (const bucket of buckets ?? []) {
    const paths = await listOwnedObjects(storage, bucket.id, userId);
    for (let index = 0; index < paths.length; index += storageDeleteBatchSize) {
      const { error: removeError } = await storage.delete(bucket.id, paths.slice(index, index + storageDeleteBatchSize));
      if (removeError) throw removeError;
    }
  }
}
