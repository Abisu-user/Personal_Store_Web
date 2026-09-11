import React, { useSyncExternalStore } from "react";
declare global {
  interface Window {
    testPath?: string;
    lastNavigation?: string;
    signOutCalls?: number;
    newItemCalls: number;
    setTestAppearance: (settings: object) => void;
    setTestNavigation: typeof import("@/lib/layout/mobile-navigation-preferences").saveMobileNavigationPreferences;
    changeTestPath: (path: string) => void;
  }
}
const subscribe = (cb: () => void) => { window.addEventListener("test:path", cb); return () => window.removeEventListener("test:path", cb); };
const read = () => window.testPath || "/dashboard";
const navigate = (path: string) => { window.lastNavigation = path; };
const router = { push: navigate, replace: navigate, refresh: () => {}, prefetch: () => {} };
const params = new URLSearchParams();
export const useRouter = () => router;
export const useSearchParams = () => params;
export const usePathname = () => useSyncExternalStore(subscribe, read, () => "/dashboard");
export const requireUser = async () => ({ id: "fixture-user", email: "layout-test@example.com" });
export const requireMfaIfEnrolled = async () => {};
export const createClient = () => ({ auth: { signOut: async () => { window.signOutCalls = (window.signOutCalls || 0) + 1; } } });
export default function Link({ children, href, prefetch, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  void prefetch;
  return <a {...props} href={href} onClick={event => { event.preventDefault(); onClick?.(event); navigate(href); }}>{children}</a>;
}
