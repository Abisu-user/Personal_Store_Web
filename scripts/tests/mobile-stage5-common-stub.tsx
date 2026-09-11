import React, { useSyncExternalStore } from "react";
declare global {
  interface Window {
    testPath?: string;
    lastNavigation?: string;
    signOutCalls?: number;
    setTestAppearance: (settings: object) => void;
  }
}
const subscribe = (callback: () => void) => { window.addEventListener("test:path", callback); return () => window.removeEventListener("test:path", callback); };
const read = () => window.testPath || "/vault";
const navigate = (path: string) => { window.lastNavigation = path; };
const router = { push: navigate, replace: navigate, refresh: () => {}, prefetch: () => {} };
export const useRouter = () => router;
export const useSearchParams = () => new URLSearchParams();
export const usePathname = () => useSyncExternalStore(subscribe, read, () => "/vault");
export const requireUser = async () => ({ id: "fixture-user", email: "layout-test@example.com" });
export const requireMfaIfEnrolled = async () => {};
export const createClient = () => ({ auth: {
  signOut: async () => { window.signOutCalls = (window.signOutCalls || 0) + 1; },
  registerPasskey: async () => ({ error: null }),
  passkey: { list: async () => ({ data: [], error: null }), delete: async () => ({ error: null }) },
} });
export default function Link({ children, href, prefetch, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  void prefetch;
  return <a {...props} href={href} onClick={event => { event.preventDefault(); onClick?.(event); navigate(href); }}>{children}</a>;
}
