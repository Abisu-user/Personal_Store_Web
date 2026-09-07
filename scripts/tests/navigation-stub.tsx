import React from "react";
const navigate = (path: string) => { window.dispatchEvent(new CustomEvent("test:navigate", { detail: path })); };
const router = { push: navigate, replace: navigate, prefetch: () => {}, refresh: () => {} };
const params = new URLSearchParams();
export const useRouter = () => router;
export const useSearchParams = () => params;
export const usePathname = () => "/vocabulary";
export default function Link({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props} href={href}>{children}</a>; }
