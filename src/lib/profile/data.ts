import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { profileAvatars, type ProfileAvatar } from "@/lib/profile/constants";

export { profileAvatars, type ProfileAvatar } from "@/lib/profile/constants";

type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type UserProfile = {
  username: string;
  displayName: string | null;
  avatar: ProfileAvatar;
};

function profileUsername(user: AuthUser) {
  const emailPrefix = user.email?.split("@", 1)[0] ?? "user";
  const normalized = emailPrefix.toLowerCase().replace(/[^a-z0-9_-]/g, "").replace(/^[-_]+/, "");
  const base = (normalized || "user").slice(0, 23);
  return `${base}-${user.id.slice(0, 8)}`;
}

function profileDisplayName(user: AuthUser) {
  const value = user.user_metadata?.display_name;
  return typeof value === "string" ? value.trim().slice(0, 80) || null : null;
}

/** Repairs profiles for accounts created before the auth-user trigger was installed. */
export async function ensureUserProfile(user: AuthUser) {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").upsert({
    id: user.id,
    username: profileUsername(user),
    display_name: profileDisplayName(user),
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;

  const { error: settingsError } = await admin.from("user_settings").upsert(
    { user_id: user.id },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (settingsError) throw settingsError;
}

export async function getUserProfile(user: AuthUser): Promise<UserProfile> {
  await ensureUserProfile(user);
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("username, display_name, avatar_path")
    .eq("id", user.id)
    .single();
  if (error || !data) throw error ?? new Error("Unable to load profile.");

  return {
    username: data.username,
    displayName: data.display_name,
    avatar: profileAvatars.includes(data.avatar_path as ProfileAvatar) ? data.avatar_path as ProfileAvatar : "✦",
  };
}
