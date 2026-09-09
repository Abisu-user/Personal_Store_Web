import { createClient } from "@/lib/supabase/client";
import { StorageManager } from "./manager";
import { SupabaseStorageProvider } from "./supabase-provider";

/** Browser transport uses only the existing publishable client and server-issued upload token. */
export function createBrowserStorageManager(): Pick<StorageManager, "uploadToSignedUrl"> {
  return new StorageManager(new SupabaseStorageProvider(createClient().storage));
}
