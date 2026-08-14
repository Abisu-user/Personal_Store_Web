import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Requires a TOTP challenge only for users who have already enrolled a verified factor. */
export async function requireMfaIfEnrolled(user: User) {
  const hasVerifiedTotp = user.factors?.some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );

  if (!hasVerifiedTotp) return;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims || data.claims.aal !== "aal2") redirect("/mfa-challenge");
}
