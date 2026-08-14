import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Verifies the session with Supabase Auth; never trust a client-supplied user id. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user || !user.email_confirmed_at) {
    redirect("/login");
  }

  return user;
});

