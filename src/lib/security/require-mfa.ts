import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Requires a TOTP challenge only for users who have already enrolled a verified factor. */
export async function requireMfaIfEnrolled() {
  const supabase = await createClient();
  const [{ data: factors, error: factorsError }, { data: aal, error: aalError }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (factorsError || aalError) redirect("/login");
  if (factors.totp.length > 0 && aal.currentLevel !== "aal2") redirect("/mfa-challenge");
}
