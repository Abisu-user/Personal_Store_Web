import { createBrowserClient } from "@supabase/ssr";

import { authCookieOptions } from "@/lib/supabase/cookie-options";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions,
      auth: {
        // A valid refresh session survives browser / PWA process termination.
        // The UI lock is handled independently by AppLockProvider.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        experimental: { passkey: true },
      },
    },
  );
}
