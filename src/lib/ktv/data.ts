import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { KtvSong, KtvWorkspaceData } from "@/lib/ktv/types";

type KtvSongRow = {
  id: string;
  song_number: string;
  title: string;
  artist: string;
  created_at: string;
  updated_at: string;
  ktv_categories: { id: string; name: string } | { id: string; name: string }[] | null;
};

type QueryError = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };

function logQueryError(scope: string, error: QueryError | null) {
  if (!error) return;
  console.error("[ktv:data] " + scope + " failed", {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

export function serializeKtvSong(row: KtvSongRow): KtvSong {
  const category = Array.isArray(row.ktv_categories) ? row.ktv_categories[0] ?? null : row.ktv_categories;
  return {
    id: row.id,
    songNumber: row.song_number,
    title: row.title,
    artist: row.artist,
    category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getKtvWorkspaceData(userId: string): Promise<KtvWorkspaceData> {
  const admin = createAdminClient();
  const [songsResult, categoriesResult] = await Promise.all([
    admin
      .from("ktv_songs")
      .select("id, song_number, title, artist, created_at, updated_at, ktv_categories:ktv_categories!ktv_songs_category_id_fkey(id, name)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1000),
    admin
      .from("ktv_categories")
      .select("id, name, sort_order")
      .eq("user_id", userId)
      .order("sort_order")
      .order("name")
      .limit(200),
  ]);

  logQueryError("songs select", songsResult.error);
  logQueryError("categories select", categoriesResult.error);
  if (songsResult.error || categoriesResult.error) throw new Error("Unable to load KTV collection.");

  return {
    songs: ((songsResult.data ?? []) as KtvSongRow[]).map(serializeKtvSong),
    categories: (categoriesResult.data ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sort_order,
    })),
  };
}
