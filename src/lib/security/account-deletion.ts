import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const storagePageSize = 100;
const storageDeleteBatchSize = 100;
const maximumStorageDepth = 12;

type AdminClient = ReturnType<typeof createAdminClient>;

async function listOwnedObjects(admin: AdminClient, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > maximumStorageDepth) throw new Error(`Storage path nesting is too deep in ${bucket}.`);
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: storagePageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const items = data ?? [];

    for (const item of items) {
      const path = `${prefix}/${item.name}`;
      if (item.id) paths.push(path);
      else paths.push(...await listOwnedObjects(admin, bucket, path, depth + 1));
    }

    if (items.length < storagePageSize) break;
    offset += items.length;
  }

  return paths;
}

async function removeOwnedStorage(admin: AdminClient, userId: string) {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw error;

  for (const bucket of buckets ?? []) {
    const paths = await listOwnedObjects(admin, bucket.id, userId);
    for (let index = 0; index < paths.length; index += storageDeleteBatchSize) {
      const { error: removeError } = await admin.storage
        .from(bucket.id)
        .remove(paths.slice(index, index + storageDeleteBatchSize));
      if (removeError) throw removeError;
    }
  }
}

export async function permanentlyDeleteAccount(userId: string) {
  const admin = createAdminClient();
  const { data: accountResult, error: accountError } = await admin.auth.admin.getUserById(userId);
  if (accountError || !accountResult.user) throw accountError ?? new Error("Account not found.");

  await removeOwnedStorage(admin, userId);

  if (accountResult.user.email) {
    const { error: flowError } = await admin
      .from("auth_verification_flows")
      .delete()
      .eq("email", accountResult.user.email);
    if (flowError && flowError.code !== "42P01" && flowError.code !== "PGRST205") throw flowError;
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
  if (deleteError) throw deleteError;
}
