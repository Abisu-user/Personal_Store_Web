import "server-only";

import { getAppLockPinStatus } from "@/lib/app-lock/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { capacityWithinDeadline, getEntryPrivacy, getProtectedFolders, privateByFolder, type EntryKind, type PrivacyRow } from "./data";
import type { DashboardData, DashboardKind } from "./types";

type EntryCandidate = {
  id: string;
  kind: EntryKind;
  title: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
};
type AnimeCandidate = PrivacyRow & {
  id: string;
  title: string | null;
  title_chinese: string | null;
  title_japanese: string | null;
  created_at: string;
};
type FolderKind = DashboardKind;

export type DesktopDashboardItem = { id: string; kind: DashboardKind; title: string; at: string; href: string };
export type DesktopShortcut = { id: string; title: string; url: string; imageUrl: string | null };
export type DesktopFolder = { id: string; kind: FolderKind; name: string; locked: boolean; updatedAt: string; href: string };
export type DesktopDashboardData = {
  shortcuts: DesktopShortcut[];
  recentOpened: DesktopDashboardItem[];
  recentAdded: DesktopDashboardItem[];
  folders: DesktopFolder[];
  capacity: DashboardData["capacity"];
  appLock: { configured: boolean; autoLockEnabled: boolean } | null;
  unavailable: string[];
};

const entryKinds: EntryKind[] = ["bookmark", "note", "code", "photo", "file"];
const paths: Record<DashboardKind, string> = {
  bookmark: "/bookmarks", note: "/notes", code: "/code", photo: "/photos", file: "/files", anime: "/anime",
};
const itemHref = (kind: DashboardKind, id: string) => `${paths[kind]}?item=${encodeURIComponent(id)}`;
const folderHref = (kind: FolderKind, id: string) => `${paths[kind]}?folder=${encodeURIComponent(id)}`;

async function getEntryCandidates(userId: string, order: "created_at" | "last_opened_at") {
  let query = createAdminClient().from("entries")
    .select("id,kind,title,created_at,updated_at,last_opened_at")
    .eq("owner_id", userId).in("kind", entryKinds).eq("security_level", "standard")
    .eq("requires_item_password", false).eq("is_archived", false).is("deleted_at", null)
    .order(order, { ascending: false }).limit(30);
  if (order === "last_opened_at") query = query.not("last_opened_at", "is", null);
  const { data, error } = await query.abortSignal(AbortSignal.timeout(12000));
  if (error) throw error;
  return (data ?? []) as EntryCandidate[];
}

async function getAnimeCandidates(userId: string) {
  const { data, error } = await createAdminClient().from("anime_library")
    .select("id,title,title_chinese,title_japanese,created_at,primary_folder:anime_folders!anime_library_folder_id_fkey(id,is_visible),all_folder_links:anime_library_folders!anime_library_folders_anime_id_fkey(folder_id,folder:anime_folders!anime_library_folders_folder_id_fkey(id,is_visible))")
    .eq("user_id", userId).is("deleted_at", null).or("is_adult.is.null,is_adult.eq.false")
    .order("created_at", { ascending: false }).limit(8).abortSignal(AbortSignal.timeout(12000));
  if (error) throw error;
  return (data ?? []) as unknown as AnimeCandidate[];
}

async function getHiddenAnimeFolders(userId: string) {
  const { data, error, count } = await createAdminClient().from("anime_folders")
    .select("id", { count: "exact" }).eq("user_id", userId).eq("scope", "standard")
    .eq("is_visible", false).limit(500).abortSignal(AbortSignal.timeout(12000));
  if (error || count === null || count > (data?.length ?? 0)) throw error ?? new Error("Incomplete Anime folder privacy state");
  return new Set((data ?? []).map((row) => row.id));
}

async function getShortcutCandidates(userId: string) {
  const admin = createAdminClient();
  const { data: ordering, error: orderError } = await admin.from("bookmark_overview_shortcuts")
    .select("entry_id,sort_order").eq("owner_id", userId).order("sort_order").limit(8).abortSignal(AbortSignal.timeout(12000));
  if (orderError) throw orderError;
  const ids = (ordering ?? []).map((row) => row.entry_id);
  if (!ids.length) return [];
  const { data, error } = await admin.from("entries")
    .select("id,kind,title,created_at,updated_at,last_opened_at,cover_image_path,cover_storage_object_id,bookmark_details(url,favicon_url)")
    .eq("owner_id", userId).eq("kind", "bookmark").eq("security_level", "standard")
    .eq("requires_item_password", false).eq("is_archived", false).is("deleted_at", null).in("id", ids).abortSignal(AbortSignal.timeout(12000));
  if (error) throw error;
  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

async function getFolderCandidates(userId: string) {
  const admin = createAdminClient();
  const results = await Promise.allSettled([
    admin.from("bookmark_folders").select("id,name,is_visible,updated_at")
      .eq("owner_id", userId).order("updated_at", { ascending: false }).limit(8).abortSignal(AbortSignal.timeout(12000)),
    admin.from("content_folders").select("id,name,content_kind,is_visible,updated_at")
      .eq("owner_id", userId).in("content_kind", ["note", "code", "photo", "file"])
      .order("updated_at", { ascending: false }).limit(16).abortSignal(AbortSignal.timeout(12000)),
    admin.from("anime_folders").select("id,name,scope,is_visible,updated_at")
      .eq("user_id", userId).eq("scope", "standard")
      .order("updated_at", { ascending: false }).limit(8).abortSignal(AbortSignal.timeout(12000)),
  ]);
  return {
    bookmarks: results[0].status === "fulfilled" && !results[0].value.error ? results[0].value.data ?? [] : null,
    content: results[1].status === "fulfilled" && !results[1].value.error ? results[1].value.data ?? [] : null,
    anime: results[2].status === "fulfilled" && !results[2].value.error ? results[2].value.data ?? [] : null,
  };
}

function err(scope: string, cause: unknown) {
  const value = cause as { code?: string; message?: string } | null;
  console.warn(`[dashboard:desktop] ${scope} unavailable`, { code: value?.code ?? null, message: value?.message ?? String(cause) });
}

export async function getDesktopDashboardData(userId: string): Promise<DesktopDashboardData> {
  const [locksResult, hiddenAnimeResult, newestResult, openedResult, animeResult, shortcutsResult, foldersResult, capacityResult, appLockResult] = await Promise.allSettled([
    getProtectedFolders(userId), getHiddenAnimeFolders(userId), getEntryCandidates(userId, "created_at"), getEntryCandidates(userId, "last_opened_at"),
    getAnimeCandidates(userId), getShortcutCandidates(userId), getFolderCandidates(userId),
    capacityWithinDeadline(userId), getAppLockPinStatus(userId),
  ]);
  const unavailable: string[] = [];
  for (const [name, result] of [["locks", locksResult], ["anime privacy", hiddenAnimeResult], ["newest", newestResult], ["opened", openedResult], ["anime", animeResult], ["shortcuts", shortcutsResult], ["folders", foldersResult], ["capacity", capacityResult], ["appLock", appLockResult]] as const) {
    if (result.status === "rejected") { unavailable.push(name); err(name, result.reason); }
  }
  const empty: DesktopDashboardData = { shortcuts: [], recentOpened: [], recentAdded: [], folders: [], capacity: null, appLock: null, unavailable };
  if (capacityResult.status === "fulfilled") {
    const value = capacityResult.value;
    empty.capacity = { databaseUsedBytes: value.databaseUsedBytes, databaseQuotaBytes: value.databaseQuotaBytes, databaseUnlimited: value.databaseUnlimited,
      storageUsedBytes: value.storageUsedBytes, storageQuotaBytes: value.storageQuotaBytes, storageUnlimited: value.storageUnlimited };
  }
  if (appLockResult.status === "fulfilled" && appLockResult.value) empty.appLock = appLockResult.value;
  // Lock-state failure means no item names, URLs, thumbnails, or folder names
  // leave the server. A successful query is never replaced by a client filter.
  if (locksResult.status !== "fulfilled") return empty;
  const locked = locksResult.value;

  const newest = newestResult.status === "fulfilled" ? newestResult.value : [];
  const opened = openedResult.status === "fulfilled" ? openedResult.value : [];
  const shortcutRows = shortcutsResult.status === "fulfilled" ? shortcutsResult.value : [];
  const allEntries = [...newest, ...opened, ...shortcutRows];
  const allowed = new Set<string>();
  const privacyResults = await Promise.allSettled(entryKinds.map((kind) => getEntryPrivacy(userId, kind,
    [...new Set(allEntries.filter((row) => row.kind === kind).map((row) => row.id))])));
  privacyResults.forEach((result, index) => {
    const kind = entryKinds[index]!;
    if (result.status === "rejected") { unavailable.push(`${kind} privacy`); err(`${kind} privacy`, result.reason); return; }
    for (const row of result.value) if (!privateByFolder(row, locked.get(kind) ?? new Set())) allowed.add(row.id);
  });
  const item = (row: EntryCandidate, at: string): DesktopDashboardItem => ({ id: row.id, kind: row.kind, title: row.title || "未命名", at, href: itemHref(row.kind, row.id) });
  empty.recentOpened = opened.filter((row) => allowed.has(row.id) && row.last_opened_at)
    .map((row) => item(row, row.last_opened_at!)).slice(0, 5);
  empty.recentAdded = newest.filter((row) => allowed.has(row.id)).map((row) => item(row, row.created_at));

  if (animeResult.status === "fulfilled" && hiddenAnimeResult.status === "fulfilled") {
    empty.recentAdded.push(...animeResult.value.filter((row) => !privateByFolder(row, hiddenAnimeResult.value))
      .map((row) => ({ id: row.id, kind: "anime" as const, title: row.title_chinese || row.title_japanese || row.title || "未命名動漫",
        at: row.created_at, href: itemHref("anime", row.id) })));
  }
  empty.recentAdded.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  empty.recentAdded = empty.recentAdded.slice(0, 3);

  empty.shortcuts = shortcutRows.filter((row) => allowed.has(row.id)).flatMap((row) => {
    const details = Array.isArray(row.bookmark_details) ? row.bookmark_details[0] : row.bookmark_details;
    if (!details?.url) return [];
    return [{ id: row.id, title: row.title, url: details.url,
      imageUrl: row.cover_image_path || row.cover_storage_object_id
        ? `/api/content-covers?entry=${row.id}&v=${encodeURIComponent(row.updated_at)}` : details.favicon_url ?? null }];
  });

  if (foldersResult.status === "fulfilled") {
    const { bookmarks, content, anime } = foldersResult.value;
    if (!bookmarks || !content || !anime) unavailable.push("some folders");
    const folders: DesktopFolder[] = [];
    for (const row of bookmarks ?? []) {
      if (row.is_visible === false) continue;
      folders.push({ id: row.id, kind: "bookmark", name: row.name, locked: locked.get("bookmark")?.has(row.id) ?? false,
      updatedAt: row.updated_at, href: folderHref("bookmark", row.id) });
    }
    for (const row of content ?? []) {
      const kind = row.content_kind as FolderKind;
      if (!entryKinds.includes(kind as EntryKind) || row.is_visible === false) continue;
      folders.push({ id: row.id, kind, name: row.name, locked: locked.get(kind as EntryKind)?.has(row.id) ?? false,
        updatedAt: row.updated_at, href: folderHref(kind, row.id) });
    }
    if (hiddenAnimeResult.status === "fulfilled") for (const row of anime ?? []) {
      if (row.is_visible === false || hiddenAnimeResult.value.has(row.id)) continue;
      folders.push({ id: row.id, kind: "anime", name: row.name, locked: false,
        updatedAt: row.updated_at, href: folderHref("anime", row.id) });
    }
    empty.folders = folders.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 8);
  }
  return empty;
}

/** Search only non-secret indexes. Vault ciphertext, adult anime, and locked
 * folder metadata are never serialized, even as a match count. */
export async function searchDesktopDashboard(userId: string, rawQuery: string, filter: DashboardKind | "all") {
  const query = rawQuery.trim().replace(/[,%()\\]/g, "").slice(0, 80);
  if (query.length < 2) return [];
  const requested = filter === "all" ? entryKinds : entryKinds.filter((kind) => kind === filter);
  const admin = createAdminClient();
  const [locksResult, hiddenAnimeResult, entryResult, urlResult, animeResult] = await Promise.allSettled([
    getProtectedFolders(userId), getHiddenAnimeFolders(userId),
    requested.length ? admin.from("entries").select("id,kind,title,created_at")
      .eq("owner_id", userId).in("kind", requested).eq("security_level", "standard")
      .eq("requires_item_password", false).eq("is_archived", false).is("deleted_at", null)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
      .order("updated_at", { ascending: false }).limit(24).abortSignal(AbortSignal.timeout(12000)) : Promise.resolve({ data: [], error: null }),
    (filter === "all" || filter === "bookmark") ? admin.from("bookmark_details")
      .select("entry_id,entry:entries!inner(owner_id)").eq("entry.owner_id", userId)
      .ilike("url", `%${query}%`).limit(12).abortSignal(AbortSignal.timeout(12000)) : Promise.resolve({ data: [], error: null }),
    (filter === "all" || filter === "anime") ? admin.from("anime_library")
      .select("id,title,title_chinese,title_japanese,created_at,primary_folder:anime_folders!anime_library_folder_id_fkey(id,is_visible),all_folder_links:anime_library_folders!anime_library_folders_anime_id_fkey(folder_id,folder:anime_folders!anime_library_folders_folder_id_fkey(id,is_visible))")
      .eq("user_id", userId).is("deleted_at", null).or("is_adult.is.null,is_adult.eq.false")
      .or(`title.ilike.%${query}%,title_chinese.ilike.%${query}%,title_japanese.ilike.%${query}%`)
      .order("updated_at", { ascending: false }).limit(12).abortSignal(AbortSignal.timeout(12000)) : Promise.resolve({ data: [], error: null }),
  ]);
  if (locksResult.status !== "fulfilled") { err("search locks", locksResult.reason); return []; }
  const entryRows = entryResult.status === "fulfilled" && !entryResult.value.error ? entryResult.value.data ?? [] : [];
  if (entryResult.status === "fulfilled" && entryResult.value.error) err("search entries", entryResult.value.error);
  const urlIds = urlResult.status === "fulfilled" && !urlResult.value.error ? (urlResult.value.data ?? []).map((row) => row.entry_id) : [];
  let urlRows: typeof entryRows = [];
  if (urlIds.length) {
    const { data, error } = await admin.from("entries").select("id,kind,title,created_at")
      .eq("owner_id", userId).eq("kind", "bookmark").eq("security_level", "standard")
      .eq("requires_item_password", false).eq("is_archived", false).is("deleted_at", null).in("id", urlIds).limit(12);
    if (!error) urlRows = data ?? []; else err("search bookmark URLs", error);
  }
  const merged = [...new Map([...entryRows, ...urlRows].map((row) => [row.id, row])).values()];
  const privacy = await Promise.allSettled(entryKinds.map((kind) => getEntryPrivacy(userId, kind,
    merged.filter((row) => row.kind === kind).map((row) => row.id))));
  const allowed = new Set<string>();
  privacy.forEach((result, index) => {
    const kind = entryKinds[index]!;
    if (result.status !== "fulfilled") { err(`search ${kind} privacy`, result.reason); return; }
    for (const row of result.value) if (!privateByFolder(row, locksResult.value.get(kind) ?? new Set())) allowed.add(row.id);
  });
  const items: DesktopDashboardItem[] = merged.filter((row) => allowed.has(row.id)).map((row) => ({
    id: row.id, kind: row.kind as EntryKind, title: row.title || "未命名", at: row.created_at,
    href: itemHref(row.kind as EntryKind, row.id),
  }));
  if (animeResult.status === "fulfilled" && !animeResult.value.error && hiddenAnimeResult.status === "fulfilled") {
    const animeRows = (animeResult.value.data ?? []) as unknown as AnimeCandidate[];
    items.push(...animeRows.filter((row) => !privateByFolder(row, hiddenAnimeResult.value)).map((row) => ({
      id: row.id, kind: "anime" as const, title: row.title_chinese || row.title_japanese || row.title || "未命名動漫",
      at: row.created_at, href: itemHref("anime", row.id),
    })));
  }
  return items.slice(0, 24);
}

/** Full folder overview, with a hard safety cap rather than silently returning
 * a truncated list as "all". No contents or thumbnails are queried. */
export async function getAllDesktopFolders(userId: string): Promise<DesktopFolder[]> {
  const admin = createAdminClient();
  const [locks, hiddenAnime, bookmarks, content, anime] = await Promise.all([
    getProtectedFolders(userId), getHiddenAnimeFolders(userId),
    admin.from("bookmark_folders").select("id,name,is_visible,updated_at", { count: "exact" })
      .eq("owner_id", userId).order("name").range(0, 999),
    admin.from("content_folders").select("id,name,content_kind,is_visible,updated_at", { count: "exact" })
      .eq("owner_id", userId).in("content_kind", ["note", "code", "photo", "file"]).order("name").range(0, 999),
    admin.from("anime_folders").select("id,name,scope,is_visible,updated_at", { count: "exact" })
      .eq("user_id", userId).eq("scope", "standard").eq("is_visible", true).order("name").range(0, 999),
  ]);
  for (const result of [bookmarks, content, anime]) {
    if (result.error || result.count === null || result.count > (result.data?.length ?? 0)) {
      throw result.error ?? new Error("Folder overview is incomplete");
    }
  }
  const output: DesktopFolder[] = [];
  for (const row of bookmarks.data ?? []) {
    if (row.is_visible === false) continue;
    output.push({ id: row.id, kind: "bookmark", name: row.name,
    locked: locks.get("bookmark")?.has(row.id) ?? false,
    updatedAt: row.updated_at, href: folderHref("bookmark", row.id) });
  }
  for (const row of content.data ?? []) {
    const kind = row.content_kind as EntryKind;
    if (!entryKinds.includes(kind) || row.is_visible === false) continue;
    output.push({ id: row.id, kind, name: row.name,
      locked: locks.get(kind)?.has(row.id) ?? false,
      updatedAt: row.updated_at, href: folderHref(kind, row.id) });
  }
  for (const row of anime.data ?? []) {
    if (hiddenAnime.has(row.id)) continue;
    output.push({ id: row.id, kind: "anime", name: row.name, locked: false,
      updatedAt: row.updated_at, href: folderHref("anime", row.id) });
  }
  return output.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "zh-Hant"));
}
