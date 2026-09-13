"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ProfileAvatar } from "@/lib/profile/constants";

type AppProfile = {
  username: string;
  displayName: string | null;
  avatar: ProfileAvatar;
};

const AppProfileContext = createContext<AppProfile | null>(null);

export function AppProfileProvider({ children, profile }: { children: ReactNode; profile: AppProfile }) {
  return <AppProfileContext.Provider value={profile}>{children}</AppProfileContext.Provider>;
}

export function useAppProfile() {
  const profile = useContext(AppProfileContext);
  if (!profile) throw new Error("useAppProfile must be used within AppProfileProvider");
  return profile;
}
