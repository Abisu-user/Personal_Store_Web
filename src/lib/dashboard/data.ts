import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserCapacity } from "@/lib/system/quota";
import type { DashboardData, DashboardKind, RecentDashboardItem } from "./types";

const entryKinds = ["bookmark", "note", "code", "photo", "file"] as const;
type EntryKind = typeof entryKinds[number];
type EntryRow = { id: string; kind: string; title: string | null; updated_at: string; security_level: string | null };
type FolderRef = { id: string; is_visible: boolean | null };
type FolderLink = { folder_id: string; folder: FolderRef | FolderRef[] | null };
type PrivacyRow = { id: string; primary_folder: FolderRef | FolderRef[] | null; all_folder_links: FolderLink[] | null };
type AnimeRow = PrivacyRow & { title: string | null; title_chinese: string | null; title_japanese: string | null; updated_at: string };

const paths: Record<EntryKind, string> = { bookmark: "/bookmarks", note: "/notes", code: "/code", photo: "/photos", file: "/files" };
const pageSize = 1000;
const recentCandidatesPerKind = 8;

function logSupabaseError(scope: string, error: unknown) {
  const value = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  console.error(`[dashboard] ${scope}`, {
    code: value?.code ?? null,
    message: value?.message ?? (error instanceof Error ? error.message : "Unknown error"),
    details: value?.details ?? null,
    hint: value?.hint ?? null,
  });
}

/** Count metadata contains no embeds, so direct and many-to-many folder relations cannot be ambiguous. */
async function getEntries(userId: string): Promise<EntryRow[]> {
  const admin = createAdminClient();
  const rows: EntryRow[] = [];
  let total = Infinity;
  while (rows.length < total) {
    const { data, error, count } = await admin.from("entries")
      .select("id,kind,title,updated_at,security_level", { count: "exact" })
      .eq("owner_id", userId).in("kind", [...entryKinds]).is("deleted_at", null)
      .order("id").range(rows.length, rows.length + pageSize - 1).abortSignal(AbortSignal.timeout(12000));
    if (error || count === null) {
      logSupabaseError("entries metadata", error ?? new Error("DASHBOARD_COUNT_UNAVAILABLE"));
      throw error ?? new Error("DASHBOARD_COUNT_UNAVAILABLE");
    }
    total = count;
    if (!data?.length && rows.length < total) throw new Error("DASHBOARD_INCOMPLETE_PAGE");
    rows.push(...((data ?? []) as EntryRow[]));
  }
  return rows;
}

async function getFallbackEntryCounts(userId: string) {
  const settled = await Promise.allSettled(entryKinds.map(async (kind) => {
    const { count, error } = await createAdminClient().from("entries")
      .select("id", { count: "exact", head: true }).eq("owner_id", userId).eq("kind", kind).is("deleted_at", null)
      .abortSignal(AbortSignal.timeout(12000));
    if (error || count === null) {
      logSupabaseError(`${kind} fallback count`, error ?? new Error("DASHBOARD_COUNT_UNAVAILABLE"));
      throw error ?? new Error("DASHBOARD_COUNT_UNAVAILABLE");
    }
    return [kind, count] as const;
  }));
  return settled;
}

async function getEntryPrivacy(userId: string, kind: EntryKind, ids: string[]): Promise<PrivacyRow[]> {
  if (!ids.length) return [];
  const bookmarkSelect = "id,primary_folder:bookmark_folders!entries_bookmark_folder_id_fkey(id,is_visible),all_folder_links:bookmark_entry_folders!bookmark_entry_folders_entry_id_fkey(folder_id,folder:bookmark_folders!bookmark_entry_folders_folder_id_fkey(id,is_visible))";
  const contentSelect = "id,primary_folder:content_folders!entries_content_folder_id_fkey(id,is_visible),all_folder_links:entry_content_folder_links!entry_content_folder_links_entry_id_fkey(folder_id,folder:content_folders!entry_content_folder_links_folder_id_fkey(id,is_visible))";
  const { data, error } = await createAdminClient().from("entries").select(kind === "bookmark" ? bookmarkSelect : contentSelect)
    .eq("owner_id", userId).eq("kind", kind).in("id", ids).is("deleted_at", null)
    .abortSignal(AbortSignal.timeout(12000));
  if (error) {
    logSupabaseError(`${kind} recent privacy`, error);
    throw error;
  }
  return (data ?? []) as unknown as PrivacyRow[];
}

async function getAnime(userId: string): Promise<{ count: number; data: AnimeRow[] }> {
  const select = "id,title,title_chinese,title_japanese,updated_at,primary_folder:anime_folders!anime_library_folder_id_fkey(id,is_visible),all_folder_links:anime_library_folders!anime_library_folders_anime_id_fkey(folder_id,folder:anime_folders!anime_library_folders_folder_id_fkey(id,is_visible))";
  const { data, error, count } = await createAdminClient().from("anime_library")
    .select(select, { count: "exact" }).eq("user_id", userId).is("deleted_at", null)
    .or("is_adult.is.null,is_adult.eq.false").order("updated_at", { ascending: false }).order("id").limit(recentCandidatesPerKind)
    .abortSignal(AbortSignal.timeout(12000));
  if (error || count === null) {
    logSupabaseError("anime summary", error ?? new Error("DASHBOARD_COUNT_UNAVAILABLE"));
    throw error ?? new Error("DASHBOARD_COUNT_UNAVAILABLE");
  }
  return { count, data: (data ?? []) as unknown as AnimeRow[] };
}

async function getProtectedFolders(userId: string) {
  const admin = createAdminClient();
  const folders = new Map<EntryKind, Set<string>>(entryKinds.map((kind) => [kind, new Set<string>()]));
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const { data, error, count } = await admin.from("folder_locks")
      .select("folder_kind,folder_id", { count: "exact" }).eq("owner_id", userId).order("id")
      .range(offset, offset + pageSize - 1).abortSignal(AbortSignal.timeout(12000));
    if (error || count === null) {
      logSupabaseError("folder locks", error ?? new Error("DASHBOARD_LOCKS_UNAVAILABLE"));
      throw error ?? new Error("DASHBOARD_LOCKS_UNAVAILABLE");
    }
    total = count;
    if (!data?.length && offset < total) throw new Error("DASHBOARD_INCOMPLETE_LOCKS");
    for (const row of data ?? []) {
      if (entryKinds.includes(row.folder_kind as EntryKind)) folders.get(row.folder_kind as EntryKind)?.add(row.folder_id);
    }
    offset += data?.length ?? 0;
  }
  return folders;
}

function oneFolder(value: FolderRef | FolderRef[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function privateByFolder(row: PrivacyRow, locked: Set<string>) {
  const primary = oneFolder(row.primary_folder);
  if (primary && (primary.is_visible === false || locked.has(primary.id))) return true;
  return (row.all_folder_links ?? []).some((link) => {
    const folder = oneFolder(link.folder);
    return locked.has(link.folder_id) || folder?.is_visible === false;
  });
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  // The browser still makes one Dashboard request. Server reads are parallel and
  // relation checks are limited to a handful of recent candidates per type.
  const [entriesResult, animeResult, locksResult, capacityResult] = await Promise.allSettled([
    getEntries(userId), getAnime(userId), getProtectedFolders(userId), capacityWithinDeadline(userId),
  ]);
  const counts: DashboardData["counts"] = { bookmark: null, anime: null, note: null, code: null, photo: null, file: null };
  const recent: RecentDashboardItem[] = [];
  const recentUnavailableKinds = new Set<DashboardKind>();

  if (entriesResult.status === "fulfilled") {
    for (const kind of entryKinds) counts[kind] = 0;
    for (const row of entriesResult.value) {
      if (!entryKinds.includes(row.kind as EntryKind)) continue;
      const kind = row.kind as EntryKind;
      counts[kind] = (counts[kind] ?? 0) + 1;
    }

    if (locksResult.status === "fulfilled") {
      const candidates = new Map<EntryKind, EntryRow[]>();
      for (const kind of entryKinds) {
        candidates.set(kind, entriesResult.value.filter((row) => row.kind === kind && row.security_level === "standard")
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, recentCandidatesPerKind));
      }
      const privacyResults = await Promise.allSettled(entryKinds.map((kind) => getEntryPrivacy(userId, kind, (candidates.get(kind) ?? []).map((row) => row.id))));
      privacyResults.forEach((result, index) => {
        const kind = entryKinds[index];
        if (result.status === "rejected") {
          recentUnavailableKinds.add(kind);
          return;
        }
        const privacy = new Map(result.value.map((row) => [row.id, row]));
        const locked = locksResult.value.get(kind) ?? new Set<string>();
        for (const row of candidates.get(kind) ?? []) {
          const relation = privacy.get(row.id);
          // A missing relationship result is also privacy-unknown and is omitted.
          if (!relation || privateByFolder(relation, locked)) continue;
          recent.push({ id: row.id, kind, title: row.title || "未命名", updatedAt: row.updated_at, href: paths[kind] });
        }
      });
    } else {
      entryKinds.forEach((kind) => recentUnavailableKinds.add(kind));
    }
  } else {
    entryKinds.forEach((kind) => recentUnavailableKinds.add(kind));
    const fallback = await getFallbackEntryCounts(userId);
    fallback.forEach((result) => { if (result.status === "fulfilled") counts[result.value[0]] = result.value[1]; });
  }

  if (animeResult.status === "fulfilled") {
    counts.anime = animeResult.value.count;
    for (const row of animeResult.value.data) {
      if (privateByFolder(row, new Set<string>())) continue;
      recent.push({ id: row.id, kind: "anime", title: row.title_chinese || row.title_japanese || row.title || "未命名動漫", updatedAt: row.updated_at, href: "/anime" });
    }
  } else {
    recentUnavailableKinds.add("anime");
  }

  recent.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  const capacity = capacityResult.status === "fulfilled" ? capacityResult.value : null;
  return {
    counts,
    recent: recent.slice(0, 5),
    recentAvailable: recentUnavailableKinds.size === 0,
    recentUnavailableKinds: [...recentUnavailableKinds],
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
