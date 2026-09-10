import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createB2StorageManager } from "@/lib/storage/b2-server";
import { createStorageManager } from "@/lib/storage/server";
import { removeOwnedStorage } from "@/lib/storage/cleanup";

export async function permanentlyDeleteAccount(userId: string) {
  const admin = createAdminClient();
  const { data: accountResult, error: accountError } = await admin.auth.admin.getUserById(userId);
  if (accountError || !accountResult.user) throw accountError ?? new Error("Account not found.");

  await removeOwnedStorage(createStorageManager(admin), userId);
  await removeOwnedStorage(createB2StorageManager(), userId);

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
