import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";
import { capacityWithinDeadline } from "@/lib/dashboard/data";
import { getNotesWorkspaceData } from "@/lib/notes/data";
import { getPhotosWorkspaceData } from "@/lib/photos/data";
import { getFilesWorkspaceData } from "@/lib/files/data";

export const dynamic = "force-dynamic";

const kinds = new Set(["bookmark", "note", "photo", "file"]);

/** Exact metadata counts only; no titles or protected folder relationships leave this endpoint. */
export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = request.nextUrl.searchParams.get("kind");
  if (!kind || !kinds.has(kind)) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  const rawStart = request.nextUrl.searchParams.get("monthStart");
  const monthStart = rawStart ? new Date(rawStart) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  if (!Number.isFinite(monthStart.getTime()) || Math.abs(Date.now() - monthStart.getTime()) > 40 * 86400000) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }
  const admin = createAdminClient();
  const base = () => admin.from("entries").select("id", { count: "exact", head: true })
    .eq("owner_id", context.userId).eq("kind", kind).eq("is_archived", false).is("deleted_at", null);
  const isBookmark = kind === "bookmark";
  const unorganizedQuery = admin.from("entries").select(
    isBookmark
      ? "id,all_folder_links:bookmark_entry_folders!bookmark_entry_folders_entry_id_fkey()"
      : "id,all_folder_links:entry_content_folder_links!entry_content_folder_links_entry_id_fkey()",
    { count: "exact", head: true },
  ).eq("owner_id", context.userId).eq("kind", kind).eq("is_archived", false).is("deleted_at", null)
    .is(isBookmark ? "bookmark_folder_id" : "content_folder_id", null).is("all_folder_links", null);
  const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();
  const [all, month, unorganized, weekUpdated, capacity] = await Promise.all([
    base(), base().gte("created_at", monthStart.toISOString()),
    unorganizedQuery,
    kind === "note" ? base().gte("updated_at", weekStart) : Promise.resolve(null),
    kind === "photo" || kind === "file" ? capacityWithinDeadline(context.userId).catch(() => null) : Promise.resolve(null),
  ]);
  if (all.error || month.error || all.count === null || month.count === null) {
    console.error("[feature-home] count failed", { kind, all: all.error?.message, month: month.error?.message });
  }
  if (unorganized.error) console.error("[feature-home] unorganized count unavailable", { kind, error: unorganized.error.message });
  if (weekUpdated?.error) console.error("[feature-home] weekly count unavailable", { kind, error: weekUpdated.error.message });
  const storageUsedBytes = capacity?.storageGroups.find((group) => group.category === (kind === "photo" ? "photos" : "files"))?.usedBytes ?? (capacity ? 0 : null);
  // Home content is independently fail-closed: the public-only loader ignores unlock cookies.
  // Only a bounded candidate set is read, never the full collection for recent cards.
  let recentEntries = null;
  if (kind !== "bookmark") {
    try {
      const options = { entryLimit: 40, publicOnly: true };
      if (kind === "note") recentEntries = (await getNotesWorkspaceData(context.userId, options)).notes.filter((entry) => !entry.archived && !entry.deletedAt).slice(0, 6);
      if (kind === "photo") recentEntries = (await getPhotosWorkspaceData(context.userId, options)).photos.filter((entry) => !entry.archived && !entry.deletedAt).slice(0, 8);
      if (kind === "file") recentEntries = (await getFilesWorkspaceData(context.userId, options)).files.filter((entry) => !entry.archived && !entry.deletedAt).slice(0, 8);
    } catch (error) {
      console.error("[feature-home] recent content unavailable", { kind, error });
    }
  }
  return NextResponse.json({ total: all.error ? null : all.count, month: month.error ? null : month.count, unorganized: unorganized.error ? null : unorganized.count, weekUpdated: weekUpdated?.error ? null : (weekUpdated?.count ?? null), storageUsedBytes, recentEntries }, { headers: { "Cache-Control": "private, no-store" } });
}
