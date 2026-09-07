import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AdultContentPermissions = {
  adultContentAccess: boolean;
  adultContentAdmin: boolean;
};

export const deniedAdultContentPermissions: AdultContentPermissions = {
  adultContentAccess: false,
  adultContentAdmin: false,
};

/** Missing rows and database errors both fail closed. */
export async function getAdultContentPermissions(
  userId: string,
): Promise<AdultContentPermissions> {
  const { data, error } = await createAdminClient()
    .from("adult_content_permissions")
    .select("adult_content_access,adult_content_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return deniedAdultContentPermissions;
  const isAdmin = data.adult_content_admin === true;
  return {
    adultContentAccess: isAdmin || data.adult_content_access === true,
    adultContentAdmin: isAdmin,
  };
}

export async function hasAdultContentAccess(userId: string) {
  return (await getAdultContentPermissions(userId)).adultContentAccess;
}

export async function isAdultContentAdmin(userId: string) {
  return (await getAdultContentPermissions(userId)).adultContentAdmin;
}
