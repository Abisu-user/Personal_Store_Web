import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AppLockPinStatus = {
  configured: boolean;
  mode: "pin4" | "pin6" | null;
};

/**
 * Reads only the non-secret PIN configuration. This lets the protected shell
 * render its keypad with the initial response instead of asking the browser
 * to make a second round trip after hydration.
 */
export async function getAppLockPinStatus(ownerId: string): Promise<AppLockPinStatus | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("app_locks")
      .select("pin_mode")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw error;

    const mode = data?.pin_mode;
    return mode === "pin4" || mode === "pin6"
      ? { configured: true, mode }
      : { configured: false, mode: null };
  } catch {
    // The client can safely fall back to its non-secret local cache and then
    // refresh the state from the protected endpoint.
    return null;
  }
}
