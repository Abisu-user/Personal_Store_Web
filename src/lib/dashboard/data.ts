import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserCapacity } from "@/lib/system/quota";
import type { DashboardData, DashboardKind, RecentDashboardItem } from "./types";

const entryKinds = ["bookmark", "note", "code", "photo", "file"] as const;
const paths = { bookmark: "/bookmarks", note: "/notes", code: "/code", photo: "/photos", file: "/files" };
const pageSize = 1000;

/** Reads only metadata; never calls collection loaders that perform trash cleanup.
 * Page by the number actually returned, including servers configured below 1000 rows.
 * The exact total prevents silently treating a PostgREST row cap as the full library.
 */
async function getEntries(userId: string) {
  const admin = createAdminClient();
  const rows = [];
  let total = Infinity;
  while (rows.length < total) {
    const { data, error, count } = await admin.from("entries")
      .select("id,kind,title,updated_at,security_level,bookmark_folder_id,content_folder_id,bookmark_folders(is_visible),content_folders(is_visible)", { count: "exact" })
      .eq("owner_id", userId).in("kind", [...entryKinds]).is("deleted_at", null)
      .order("id").range(rows.length, rows.length + pageSize - 1).abortSignal(AbortSignal.timeout(12000));
    if (error || count === null) throw error ?? new Error("DASHBOARD_COUNT_UNAVAILABLE");
    total = count;
    if (!data?.length && rows.length < total) throw new Error("DASHBOARD_INCOMPLETE_PAGE");
    rows.push(...(data ?? []));
  }
  return rows;
}

async function getAnime(userId: string) {
  return createAdminClient().from("anime_library")
    .select("id,title,title_chinese,title_japanese,updated_at,folder_id,anime_folders(is_visible),anime_library_folders(folder_id,anime_folders(is_visible))", { count: "exact" })
    .eq("user_id", userId).is("deleted_at", null).or("is_adult.is.null,is_adult.eq.false")
    .order("updated_at", { ascending: false }).order("id").limit(5)
    .abortSignal(AbortSignal.timeout(12000));
}

async function getProtectedFolders(userId: string) {
  const admin = createAdminClient();
  const folders = new Set<string>();
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const { data, error, count } = await admin.from("folder_locks")
      .select("folder_id", { count: "exact" }).eq("owner_id", userId).order("id")
      .range(offset, offset + pageSize - 1).abortSignal(AbortSignal.timeout(12000));
    if (error || count === null) throw error ?? new Error("DASHBOARD_LOCKS_UNAVAILABLE");
    total = count;
    if (!data?.length && offset < total) throw new Error("DASHBOARD_INCOMPLETE_LOCKS");
    for (const row of data ?? []) folders.add(row.folder_id);
    offset += data?.length ?? 0;
  }
  return folders;
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  // Typically four parallel reads: entries, ordinary anime, folder protection,
  // and the existing capacity RPC. No per-tile calls or write operations.
  const [entriesResult, animeResult, locksResult, capacityResult] = await Promise.allSettled([
    getEntries(userId), getAnime(userId), getProtectedFolders(userId), capacityWithinDeadline(userId),
  ]);
  const counts: DashboardData["counts"] = { bookmark: null, anime: null, note: null, code: null, photo: null, file: null };
  const recent: RecentDashboardItem[] = [];
  if (entriesResult.status === "fulfilled") {
    for (const kind of entryKinds) counts[kind] = 0;
    for (const row of entriesResult.value) {
      if (!entryKinds.includes(row.kind as typeof entryKinds[number])) continue;
      const kind = row.kind as typeof entryKinds[number];
      counts[kind] = (counts[kind] ?? 0) + 1;
      const folder = row.bookmark_folder_id ?? row.content_folder_id;
      const bookmarkFolder = Array.isArray(row.bookmark_folders) ? row.bookmark_folders[0] : row.bookmark_folders;
      const contentFolder = Array.isArray(row.content_folders) ? row.content_folders[0] : row.content_folders;
      // Home is a preview surface: protected folders stay private even if a
      // workspace has been unlocked. A failed protection read fails closed.
      if (locksResult.status !== "fulfilled" || (folder && locksResult.value.has(folder)) ||
          bookmarkFolder?.is_visible === false || contentFolder?.is_visible === false ||
          row.security_level !== "standard") continue;
      recent.push({ id: row.id, kind, title: row.title || "未命名", updatedAt: row.updated_at, href: paths[kind] });
    }
  }
  const anime = animeResult.status === "fulfilled" && !animeResult.value.error ? animeResult.value : null;
  if (anime && anime.count !== null) {
    counts.anime = anime.count;
    for (const row of anime.data ?? []) {
      const primary = Array.isArray(row.anime_folders) ? row.anime_folders[0] : row.anime_folders;
      const links = row.anime_library_folders ?? [];
      if (locksResult.status !== "fulfilled" || primary?.is_visible === false ||
          (row.folder_id && locksResult.value.has(row.folder_id)) ||
          links.some(link => {
            const folder = Array.isArray(link.anime_folders) ? link.anime_folders[0] : link.anime_folders;
            return folder?.is_visible === false || locksResult.value.has(link.folder_id);
          })) continue;
      recent.push({
      id: row.id, kind: "anime" as DashboardKind, title: row.title_chinese || row.title_japanese || row.title || "未命名動漫",
      updatedAt: row.updated_at, href: "/anime",
      });
    }
  }
  recent.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  const capacity = capacityResult.status === "fulfilled" ? capacityResult.value : null;
  return {
    counts, recent: recent.slice(0, 5),
    recentAvailable: entriesResult.status === "fulfilled" && locksResult.status === "fulfilled" && counts.anime !== null,
    capacity: capacity ? {
      databaseUsedBytes: capacity.databaseUsedBytes, databaseQuotaBytes: capacity.databaseQuotaBytes, databaseUnlimited: capacity.databaseUnlimited,
      storageUsedBytes: capacity.storageUsedBytes, storageQuotaBytes: capacity.storageQuotaBytes, storageUnlimited: capacity.storageUnlimited,
    } : null,
  };
}

// A nonessential capacity RPC must never keep the whole summary pending forever.
async function capacityWithinDeadline(userId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getUserCapacity(userId),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("CAPACITY_TIMEOUT")), 12000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
