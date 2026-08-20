"use client";

import { useEffect } from "react";
import { applyAppearance, readAppearance } from "@/lib/appearance/preferences";

/** Applies the saved device preference after client-side navigation as well as on a full reload. */
export function AppearanceProvider() {
  useEffect(() => { applyAppearance(readAppearance()); }, []);
  return null;
}
