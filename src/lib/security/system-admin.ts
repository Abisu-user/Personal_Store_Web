import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function isSystemAdmin(userId: string) {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return !error && data?.role === "admin";
}
