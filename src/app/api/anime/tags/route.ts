import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnimePreferences } from "@/lib/anime/data";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const id = z.string().uuid();
const scope = z.enum(["standard", "adult"]);
const createSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  scope: scope.default("standard"),
  folderId: id.nullable().optional(),
});
const updateSchema = z.object({ id, name: z.string().trim().min(1).max(50) });
const deleteSchema = z.object({ id });

const serializeTag = (tag: { id: string; name: string; color: string | null; folder_id: string | null }) => ({
  id: tag.id,
  name: tag.name,
  color: tag.color,
  folderId: tag.folder_id ?? null,
});

async function mayUseScope(userId: string, value: "standard" | "adult") {
  return value === "standard" || (await getAnimePreferences(userId)).adultModeEnabled;
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入有效的類別名稱。" }, { status: 400 });
  if (!(await mayUseScope(context.userId, parsed.data.scope))) return NextResponse.json({ error: "請先啟用成人內容模式。" }, { status: 403 });
  try {
    const admin = createAdminClient();
    if (parsed.data.folderId) {
      const { data: folder, error: folderError } = await admin.from("anime_folders").select("id").eq("id", parsed.data.folderId).eq("user_id", context.userId).eq("scope", parsed.data.scope).maybeSingle();
      if (folderError || !folder) return NextResponse.json({ error: "請選擇目前清單內的資料夾。" }, { status: 400 });
    }
    const { data, error } = await admin.from("anime_tags").insert({ user_id: context.userId, name: parsed.data.name, color: parsed.data.color ?? null, scope: parsed.data.scope, folder_id: parsed.data.folderId ?? null }).select("id,name,color,folder_id").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "此資料夾已有同名類別。" }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ tag: serializeTag(data) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "無法儲存類別。" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入有效的類別名稱。" }, { status: 400 });
  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin.from("anime_tags").select("id,scope").eq("id", parsed.data.id).eq("user_id", context.userId).maybeSingle();
  if (currentError || !current) return NextResponse.json({ error: "找不到此類別。" }, { status: 404 });
  if (!(await mayUseScope(context.userId, current.scope))) return NextResponse.json({ error: "請先啟用成人內容模式。" }, { status: 403 });
  const { data, error } = await admin.from("anime_tags").update({ name: parsed.data.name }).eq("id", current.id).eq("user_id", context.userId).select("id,name,color,folder_id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: error?.code === "23505" ? "此資料夾已有同名類別。" : "無法修改類別。" }, { status: error?.code === "23505" ? 409 : 503 });
  return NextResponse.json({ tag: serializeTag(data) });
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "找不到要移除的類別。" }, { status: 400 });
  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin.from("anime_tags").select("id,scope").eq("id", parsed.data.id).eq("user_id", context.userId).maybeSingle();
  if (currentError || !current) return NextResponse.json({ error: "找不到此類別。" }, { status: 404 });
  if (!(await mayUseScope(context.userId, current.scope))) return NextResponse.json({ error: "請先啟用成人內容模式。" }, { status: 403 });
  const { error } = await admin.from("anime_tags").delete().eq("id", current.id).eq("user_id", context.userId);
  if (error) return NextResponse.json({ error: "無法移除類別。" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
