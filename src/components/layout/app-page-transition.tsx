"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Keeps the app chrome mounted while only the route content gets a short reveal. */
export function AppPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="app-page-transition" key={pathname}>{children}</div>;
}
