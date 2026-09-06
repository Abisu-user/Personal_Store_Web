import React from "react";
const router = { push: (path: string) => { window.dispatchEvent(new CustomEvent("test:navigate", { detail: path })); }, replace: () => {}, prefetch: () => {}, refresh: () => {} };
const params = new URLSearchParams();
export const useRouter = () => router;
export const useSearchParams = () => params;
export const usePathname = () => "/vocabulary";
export default function Link({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props} href={href}>{children}</a>; }
