import type { SVGProps } from "react";

export type AppIconName =
  | "anime" | "appearance" | "bookmark" | "calendar" | "code"
  | "database" | "file" | "home" | "lock" | "logout" | "more"
  | "note" | "organize" | "photo" | "plus" | "profile" | "search"
  | "security" | "settings" | "storage" | "vocabulary";

const paths: Record<AppIconName, React.ReactNode> = {
  home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.4 9.4V21h13.2V9.4M9 21v-7h6v7"/></>,
  bookmark: <><path d="M5 4.8A2.8 2.8 0 0 1 7.8 2h8.4A2.8 2.8 0 0 1 19 4.8V22l-7-4-7 4Z"/></>,
  note: <><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  code: <><path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M14 4l-4 16"/></>,
  file: <><path d="M5 2h9l5 5v15H5z"/><path d="M14 2v6h5M8 13h8M8 17h8"/></>,
  photo: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3.5 3.5 2.5-2.5 5 5"/></>,
  vocabulary: <><path d="M4 5h7v14H4zM13 5h7v14h-7z"/><path d="M7.5 8v8M16.5 8v8M5.5 11h4M14.5 12h4"/></>,
  anime: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 6 3-6 3Z"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
  organize: <><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="17" r="2" fill="currentColor" stroke="none"/></>,
  appearance: <><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z"/></>,
  storage: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  security: <><path d="M12 2 20 5v6c0 5.4-3.4 9-8 11-4.6-2-8-5.6-8-11V5Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.7l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7L10.5 2h-3l-.7 2a7 7 0 0 0-1.7.7l-1.9-.9-2.1 2.1L2 7.8a7 7 0 0 0-.7 1.7l-2 .7v3l2 .7a7 7 0 0 0 .7 1.7l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.7.7l.7 2h3l.7-2a7 7 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .7-1.7Z" transform="translate(3) scale(.75)"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  more: <><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/></>,
  logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/></>,
};

export function AppIcon({ name, className = "", ...props }: { name: AppIconName } & SVGProps<SVGSVGElement>) {
  return <svg aria-hidden="true" className={`app-icon ${className}`.trim()} fill="none" focusable="false" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" {...props}>{paths[name]}</svg>;
}
