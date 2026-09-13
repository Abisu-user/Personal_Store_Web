/* Read-only production validation. It prints schema/error metadata and counts only; never row contents or credentials. */
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase server environment variables.");
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const nil = "00000000-0000-0000-0000-000000000000";
const bookmarkPrivacy = "id,primary_folder:bookmark_folders!entries_bookmark_folder_id_fkey(id,is_visible),all_folder_links:bookmark_entry_folders!bookmark_entry_folders_entry_id_fkey(folder_id,folder:bookmark_folders!bookmark_entry_folders_folder_id_fkey(id,is_visible))";
const contentPrivacy = "id,primary_folder:content_folders!entries_content_folder_id_fkey(id,is_visible),all_folder_links:entry_content_folder_links!entry_content_folder_links_entry_id_fkey(folder_id,folder:content_folders!entry_content_folder_links_folder_id_fkey(id,is_visible))";
const animePrivacy = "id,primary_folder:anime_folders!anime_library_folder_id_fkey(id,is_visible),all_folder_links:anime_library_folders!anime_library_folders_anime_id_fkey(folder_id,folder:anime_folders!anime_library_folders_folder_id_fkey(id,is_visible))";

const checks = [];
for (const [name, query] of [
  ["bookmark", admin.from("entries").select(bookmarkPrivacy).eq("owner_id", nil).eq("kind", "bookmark").limit(1)],
  ...["note", "code", "photo", "file"].map((kind) => [kind, admin.from("entries").select(contentPrivacy).eq("owner_id", nil).eq("kind", kind).limit(1)]),
  ["anime", admin.from("anime_library").select(animePrivacy).eq("user_id", nil).limit(1)],
]) {
  const { error } = await query;
  checks.push({ name, ok: !error, code: error?.code ?? null, message: error?.message ?? null });
}

const email = process.env.DASHBOARD_TEST_EMAIL;
let counts = null;
let recentKinds = null;
if (email) {
  let user = null;
  for (let page = 1; page <= 10 && !user; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase()) ?? null;
    if (data.users.length < 1000) break;
  }
  if (!user) throw new Error("Dashboard test account was not found.");
  counts = {};
  for (const kind of ["bookmark", "note", "code", "photo", "file"]) {
    const { count, error } = await admin.from("entries").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("kind", kind).is("deleted_at", null);
    if (error) throw error;
    counts[kind] = count;
  }
  const { count, error } = await admin.from("anime_library").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("deleted_at", null).or("is_adult.is.null,is_adult.eq.false");
  if (error) throw error;
  counts.anime = count;

  const { data: metadata, error: metadataError } = await admin.from("entries").select("id,kind,updated_at,security_level")
    .eq("owner_id", user.id).in("kind", ["bookmark", "note", "code", "photo", "file"]).is("deleted_at", null).order("updated_at", { ascending: false });
  if (metadataError) throw metadataError;
  const { data: locks, error: locksError } = await admin.from("folder_locks").select("folder_kind,folder_id").eq("owner_id", user.id);
  if (locksError) throw locksError;
  const locked = new Map(["bookmark", "note", "code", "photo", "file"].map((kind) => [kind, new Set()]));
  for (const row of locks ?? []) locked.get(row.folder_kind)?.add(row.folder_id);
  const recent = [];
  const one = (folder) => Array.isArray(folder) ? folder[0] ?? null : folder;
  const isPrivate = (row, lockSet) => {
    const primary = one(row.primary_folder);
    return Boolean(primary && (primary.is_visible === false || lockSet.has(primary.id)) || (row.all_folder_links ?? []).some((link) => {
      const folder = one(link.folder);
      return lockSet.has(link.folder_id) || folder?.is_visible === false;
    }));
  };
  for (const kind of ["bookmark", "note", "code", "photo", "file"]) {
    const candidates = (metadata ?? []).filter((row) => row.kind === kind && row.security_level === "standard").slice(0, 8);
    if (!candidates.length) continue;
    const query = kind === "bookmark" ? bookmarkPrivacy : contentPrivacy;
    const { data, error } = await admin.from("entries").select(query).eq("owner_id", user.id).eq("kind", kind).in("id", candidates.map((row) => row.id));
    if (error) throw error;
    const relations = new Map((data ?? []).map((row) => [row.id, row]));
    for (const candidate of candidates) {
      const relation = relations.get(candidate.id);
      if (relation && !isPrivate(relation, locked.get(kind))) recent.push({ kind, updated_at: candidate.updated_at });
    }
  }
  const { data: animeRows, error: animeError } = await admin.from("anime_library").select(`${animePrivacy},updated_at`).eq("user_id", user.id)
    .is("deleted_at", null).or("is_adult.is.null,is_adult.eq.false").order("updated_at", { ascending: false }).limit(8);
  if (animeError) throw animeError;
  for (const row of animeRows ?? []) if (!isPrivate(row, new Set())) recent.push({ kind: "anime", updated_at: row.updated_at });
  recentKinds = recent.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 5).map((row) => row.kind);
}

console.log(JSON.stringify({ checks, counts, recentKinds }, null, 2));
if (checks.some((check) => !check.ok)) process.exitCode = 1;
