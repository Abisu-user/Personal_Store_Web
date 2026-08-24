"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const routes: Record<string, { href: string; label: string }> = {
  "/bookmarks": { href: "/create/bookmark", label: "＋ 新增收藏" },
  "/notes": { href: "/create/note", label: "＋ 新增筆記" },
  "/code": { href: "/create/code", label: "＋ 新增程式碼" },
  "/files": { href: "/create/file", label: "＋ 上傳檔案" },
  "/photos": { href: "/create/photo", label: "＋ 上傳照片" },
};

export function ContextCreateButton() {
  const pathname = usePathname();
  const action = routes[pathname];
  return action ? <Link className="context-create-button" href={action.href}>{action.label}</Link> : null;
}
