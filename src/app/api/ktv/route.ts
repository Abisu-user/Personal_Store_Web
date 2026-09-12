import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { getKtvWorkspaceData, serializeKtvSong } from "@/lib/ktv/data";

const id = z.string().uuid();
const songFields = {
  songNumber: z.string().trim().min(1, "請輸入點歌號碼。").max(40, "點歌號碼過長。"),
  title: z.string().trim().min(1, "請輸入歌曲名稱。").max(300, "歌曲名稱過長。"),
  artist: z.string().trim().min(1, "請輸入歌手。").max(200, "歌手名稱過長。"),
  categoryId: id.nullable().optional(),
};
const createSchema = z.object(songFields);
const updateSchema = z.object({ id, ...songFields });
const deleteSchema = z.object({ id });
const songSelect = "id, song_number, title, artist, created_at, updated_at, ktv_categories:ktv_categories!ktv_songs_category_id_fkey(id, name)";
const mutationSelect = "id, song_number, title, artist, category_id, created_at, updated_at";

type MutationSongRow = {
  id: string;
  song_number: string;
  title: string;
  artist: string;
  category_id: string | null;
  created_at: string;
  updated_at: string;
};

type QueryError = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
function logQueryError(scope: string, error: QueryError | null) {
  if (!error) return;
  console.error("[api:ktv] " + scope + " failed", {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}
function privateJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
function jsonError(error: string, status: number, data: Record<string, unknown> = {}) {
  return privateJson({ error, ...data }, status);
}
async function categoryForUser(userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return null;
  const { data, error } = await createAdminClient().from("ktv_categories").select("id,name").eq("id", categoryId).eq("user_id", userId).maybeSingle();
  logQueryError("category ownership check", error);
  if (error) throw error;
  return data;
}
function serializeMutationSong(row: MutationSongRow, category: { id: string; name: string } | null) {
  return {
    id: row.id,
    songNumber: row.song_number,
    title: row.title,
    artist: row.artist,
    category: row.category_id ? category : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
async function duplicateSong(userId: string, songNumber: string, exceptId?: string) {
  let query = createAdminClient().from("ktv_songs").select(songSelect).eq("user_id", userId).eq("song_number", songNumber);
  if (exceptId) query = query.neq("id", exceptId);
  const { data, error } = await query.maybeSingle();
  logQueryError("duplicate song check", error);
  if (error) throw error;
  return data ? serializeKtvSong(data) : null;
}

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  try {
    return privateJson(await getKtvWorkspaceData(context.userId));
  } catch {
    return jsonError("KTV 收藏暫時無法讀取。", 503);
  }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "請檢查歌曲資料。", 400);
  try {
    const category = await categoryForUser(context.userId, parsed.data.categoryId);
    if (parsed.data.categoryId && !category) return jsonError("請選擇自己的分類。", 400);
    const duplicate = await duplicateSong(context.userId, parsed.data.songNumber);
    if (duplicate) return jsonError("這個點歌號碼已存在。", 409, { duplicate });
    const { data, error } = await createAdminClient().from("ktv_songs").insert({
      user_id: context.userId,
      song_number: parsed.data.songNumber,
      title: parsed.data.title,
      artist: parsed.data.artist,
      category_id: parsed.data.categoryId ?? null,
    }).select(mutationSelect).single();
    logQueryError("song insert", error);
    if (error) {
      if (error.code === "23505") {
        const duplicate = await duplicateSong(context.userId, parsed.data.songNumber);
        return jsonError("這個點歌號碼已存在。", 409, duplicate ? { duplicate } : {});
      }
      throw error;
    }
    return privateJson({ song: serializeMutationSong(data as MutationSongRow, category) }, 201);
  } catch {
    return jsonError("無法新增歌曲，請稍後再試。", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "請檢查歌曲資料。", 400);
  try {
    const category = await categoryForUser(context.userId, parsed.data.categoryId);
    if (parsed.data.categoryId && !category) return jsonError("請選擇自己的分類。", 400);
    const duplicate = await duplicateSong(context.userId, parsed.data.songNumber, parsed.data.id);
    if (duplicate) return jsonError("這個點歌號碼已存在。", 409, { duplicate });
    const { data, error } = await createAdminClient().from("ktv_songs").update({
      song_number: parsed.data.songNumber,
      title: parsed.data.title,
      artist: parsed.data.artist,
      category_id: parsed.data.categoryId ?? null,
    }).eq("id", parsed.data.id).eq("user_id", context.userId).select(mutationSelect).maybeSingle();
    logQueryError("song update", error);
    if (error) {
      if (error.code === "23505") {
        const duplicate = await duplicateSong(context.userId, parsed.data.songNumber, parsed.data.id);
        return jsonError("這個點歌號碼已存在。", 409, duplicate ? { duplicate } : {});
      }
      throw error;
    }
    if (!data) return jsonError("找不到這首歌曲。", 404);
    return privateJson({ song: serializeMutationSong(data as MutationSongRow, category) });
  } catch {
    return jsonError("無法儲存歌曲，請稍後再試。", 503);
  }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("找不到要刪除的歌曲。", 400);
  const { data, error } = await createAdminClient().from("ktv_songs").delete().eq("id", parsed.data.id).eq("user_id", context.userId).select("id").maybeSingle();
  logQueryError("song delete", error);
  if (error) return jsonError("無法刪除歌曲，請稍後再試。", 503);
  if (!data) return jsonError("找不到這首歌曲。", 404);
  return privateJson({ ok: true });
}
