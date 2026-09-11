"use client";
import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CreateItemModal } from "@/components/ui/create-item-modal";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
const Bookmark = dynamic(() => import("@/components/bookmarks/bookmarks-workspace").then(m => m.BookmarksWorkspace));
const Note = dynamic(() => import("@/components/notes/notes-workspace").then(m => m.NotesWorkspace));
const Code = dynamic(() => import("@/components/code/code-workspace").then(m => m.CodeWorkspace));
const File = dynamic(() => import("@/components/files/files-workspace").then(m => m.FilesWorkspace));
const Photo = dynamic(() => import("@/components/photos/photos-workspace").then(m => m.PhotosWorkspace));
const Vocabulary = dynamic(() => import("@/components/vocabulary/vocabulary-workspace").then(m => m.VocabularyWorkspace));
export const createLabels = { bookmark: "新增網站收藏", note: "新增筆記", code: "新增程式碼", file: "新增檔案", photo: "新增照片", vocabulary: "新增單字" };
export type CreateKind = keyof typeof createLabels;
const createIcons: Record<CreateKind, AppIconName> = { bookmark: "bookmark", note: "note", code: "code", file: "file", photo: "photo", vocabulary: "vocabulary" };
const OpenCreate = createContext<(kind?: CreateKind) => void>(() => {});
export const useOpenCreate = () => useContext(OpenCreate);
export function CreateItemButton({ kind, className = "button page-create-button", children }: { kind?: CreateKind; className?: string; children: ReactNode }) {
  const open = useOpenCreate();
  return <button className={className} type="button" onClick={() => open(kind)}>{children}</button>;
}
export function CreateItemProvider({ children }: { children: ReactNode }) {
  const router = useRouter(); const searchParams = useSearchParams(); const pathname = usePathname();
  const [kind, setKind] = useState<CreateKind | "choose" | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const requested = searchParams.get("create");
    if (!requested || !(requested in createLabels)) return;
    queueMicrotask(() => setKind(requested as CreateKind));
    const next = new URLSearchParams(searchParams.toString()); next.delete("create");
    router.replace(pathname + (next.size ? `?${next}` : ""), { scroll: false });
  }, [pathname, router, searchParams]);
  useEffect(() => { const error = () => setNotice("資料已新增，但清單更新失敗，請重新整理。"); window.addEventListener("personal-vault:create-refresh-error", error); return () => window.removeEventListener("personal-vault:create-refresh-error", error); }, []);
  const complete = () => { window.dispatchEvent(new CustomEvent("personal-vault:item-created", { detail: kind })); setNotice("已新增資料。"); setKind(null); };
  return <OpenCreate.Provider value={type => { setNotice(""); setKind(type || "choose"); }}>{children}
    {notice && <div className="create-success-toast" role="status">{notice}<button aria-label="關閉通知" type="button" onClick={() => setNotice("")}>×</button></div>}
    {kind === "choose" && <MobileBottomSheet className="mobile-create-chooser" open title="新增資料" onClose={() => setKind(null)}><div className="create-type-options">{Object.entries(createLabels).map(([type,label]) => <button className="secondary-button" key={type} type="button" onClick={() => setKind(type as CreateKind)}><AppIcon name={createIcons[type as CreateKind]} /><span>{label}</span></button>)}</div></MobileBottomSheet>}
    {kind && kind !== "choose" && <CreateItemModal key={kind} title={createLabels[kind]} open onClose={() => setKind(null)} onSaved={complete}>
      {kind === "bookmark" ? <Bookmark createMode /> : kind === "note" ? <Note createMode initialData={{ notes: [], categories: [], folders: [], tags: [] }} /> : kind === "code" ? <Code createMode initialData={{ snippets: [], categories: [], folders: [], tags: [] }} /> : kind === "file" ? <File createMode initialData={{ files: [], categories: [], folders: [], tags: [] }} /> : kind === "photo" ? <Photo createMode initialData={{ photos: [], categories: [], folders: [] }} /> : <Vocabulary createMode />}
    </CreateItemModal>}
  </OpenCreate.Provider>;
}
