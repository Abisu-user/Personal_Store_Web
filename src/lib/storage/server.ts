import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { StorageManager } from "./manager";
import { SupabaseStorageProvider } from "./supabase-provider";

/** Privileged server transport. Call only after the existing session/ownership checks. */
export function createStorageManager(client = createAdminClient()) {
  // Phase 1 deliberately has a single provider; no R2/metadata migration yet.
  return new StorageManager(new SupabaseStorageProvider(client.storage));
}
