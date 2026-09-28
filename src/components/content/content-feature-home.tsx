"use client";

import { ReactNode, useState } from "react";
import Image from "next/image";
import { AppIcon } from "@/components/ui/app-icon";
import { FeatureHome, featureHomeStyles as styles, type HomeActivity, type HomeFolder } from "@/components/content/feature-home";
import { formatBytes } from "@/lib/format-bytes";
import { formatRelativeTime } from "@/lib/feature-home/time";
import type { Note, NotesWorkspaceData } from "@/lib/notes/types";
import type { StoredPhoto, PhotosWorkspaceData } from "@/lib/photos/types";
import type { StoredFile, FilesWorkspaceData } from "@/lib/files/types";

type Kind = "note" | "photo" | "file";
type Entry = Note | StoredPhoto | StoredFile;
type Folder = NotesWorkspaceData["folders"][number] | PhotosWorkspaceData["folders"][number] | FilesWorkspaceData["folders"][number];
type Config = { title: string; subtitle: string; all: string; month: string; empty: string };
const config: Record<Kind, Config> = {
  note: { title: "最近筆記", subtitle: "依最近修改時間排序", all: "全部筆記", month: "本月新增", empty: "還沒有筆記" },
  photo: { title: "最近照片", subtitle: "依上傳時間顯示", all: "全部照片", month: "本月新增", empty: "還沒有照片" },
  file: { title: "最近檔案", subtitle: "最近上傳與修改的內容", all: "全部檔案", month: "本月上傳", empty: "還沒有檔案" },
};

function visibleEntry(entry: Entry, locked: Set<string>) {
  return !entry.deletedAt && !entry.archived && !entry.folders.some((folder) => locked.has(folder.id) || folder.is_visible === false);
}

export function ContentFeatureHome({ kind, folders, onLibrary, onFolder, onOpen, createAction, storageUsedBytes, counts, failed = false }: {
  kind: Kind; folders: Folder[]; onLibrary: () => void;
  onFolder: (id: string | null) => void; onOpen: (entry: Entry) => void;
  createAction: ReactNode; storageUsedBytes?: number | null; counts?: { total: number | null; month: number | null; unorganized: number | null; weekUpdated: number | null; storageUsedBytes: number | null; recentEntries: Entry[] | null } | null; failed?: boolean;
}) {
  const [now] = useState(() => Date.now());
  const locked = new Set(folders.filter((folder) => folder.is_locked).map((folder) => folder.id));
  // Never use the management payload for home cards: it can include a temporarily
  // unlocked folder. The API's public-only limited result is independent of that state.
  const active = (counts?.recentEntries ?? []).filter((entry) => visibleEntry(entry, locked));
  const recent = [...active].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, kind === "photo" ? 8 : 6);
  const metrics = [
    { label: config[kind].all, value: counts?.total ?? "—", description: counts?.total == null ? "目前無法取得" : "目前保存的內容", onClick: onLibrary },
    { label: "未整理", value: counts?.unorganized ?? "—", description: counts?.unorganized == null ? "目前無法取得" : "尚未放入資料夾", onClick: () => onFolder(null) },
    kind === "note"
      ? { label: "最近更新", value: counts?.weekUpdated ?? "—", description: "近 7 天有更新" }
      : { label: config[kind].month, value: counts?.month ?? "—", description: "本月新增的內容" },
    kind === "note"
      ? { label: config[kind].month, value: counts?.month ?? "—", description: "本月新增的筆記" }
      : { label: "使用容量", value: (counts?.storageUsedBytes ?? storageUsedBytes) == null ? "—" : formatBytes((counts?.storageUsedBytes ?? storageUsedBytes)!), description: (counts?.storageUsedBytes ?? storageUsedBytes) == null ? "容量暫時無法取得" : "目前儲存使用量" },
  ];
  const activities: HomeActivity[] = recent.map((entry) => {
    const changed = Date.parse(entry.updatedAt) - Date.parse(entry.createdAt) > 60_000;
    const verb = changed ? "修改" : kind === "note" ? "新增" : "上傳";
    return { id: entry.id, label: `${verb} ${entry.title}`, detail: entry.folders.map((folder) => folder.name).join("、") || "未整理", at: entry.updatedAt, onClick: () => onOpen(entry) };
  });
  const homeFolders: HomeFolder[] = [
    { id: "unorganized", name: "未整理", count: counts?.unorganized ?? undefined, onClick: () => onFolder(null) },
    ...folders.filter((folder) => folder.is_visible && !folder.is_locked).map((folder) => ({
      id: folder.id, name: folder.name,
      onClick: () => onFolder(folder.id),
    })),
  ];

  return <FeatureHome activities={activities} activitiesUnavailable={counts?.recentEntries === null || failed} createAction={createAction} emptyLabel={config[kind].empty} folders={homeFolders} loading={!counts && !failed} metrics={metrics} onShowAll={onLibrary} subtitle={config[kind].subtitle} title={config[kind].title}>
    {counts?.recentEntries === null || failed ? <p>近期內容暫時無法載入。</p> : recent.length ? <div className={`${styles.cards} ${kind === "photo" ? styles.photoCards : ""}`}>{recent.map((entry) => <button className={styles.card} key={entry.id} onClick={() => onOpen(entry)} type="button">
      {kind === "photo" ? <span className={styles.cover}><Image alt="" fill loading="lazy" sizes="(max-width: 700px) 45vw, 20vw" src={(entry as StoredPhoto).imageUrl} unoptimized /></span>
        : kind === "note" ? <span className={styles.cover}>{(entry as Note).coverImageUrl ? <Image alt="" fill loading="lazy" sizes="(max-width: 700px) 45vw, 25vw" src={(entry as Note).coverImageUrl!} unoptimized /> : <AppIcon name="note" />}</span>
          : <span className={styles.fileIcon}>{(entry as StoredFile).mimeType.split("/").at(-1)?.slice(0, 4).toUpperCase() || <AppIcon name="file" />}</span>}
      <strong>{entry.title}</strong>
      <small>{entry.folders.map((folder) => folder.name).join("、") || "未整理"} · {formatRelativeTime(entry.updatedAt, now)}</small>
      {kind === "note" && <p>{(entry as Note).description || (entry as Note).content.replace(/[#*_`>\[\]()]/g, " ").trim().slice(0, 150)}</p>}
      {kind === "file" && <small>{(entry as StoredFile).originalFilename} · {formatBytes((entry as StoredFile).byteSize)}</small>}
    </button>)}</div> : <p>最近還沒有可顯示的內容。</p>}
  </FeatureHome>;
}
