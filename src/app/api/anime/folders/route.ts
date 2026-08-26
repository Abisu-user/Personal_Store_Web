import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnimePreferences } from "@/lib/anime/data";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const id = z.string().uuid();
const scope = z.enum(["standard", "adult"]);
const createSchema = z.object({ name: z.string().trim().min(1).max(80), scope: scope.default("standard") });
const patchSchema = z.object({ id, name: z.string().trim().min(1).max(80).optional(), sortOrder: z.number().int().min(0).max(10_000).optional(), isVisible: z.boolean().optional() });
const deleteSchema = z.object({ id });

function serializeFolder(folder: { id: string; name: string; scope: "standard" | "adult"; sort_order: number; is_visible: boolean }) {
  return {
    id: folder.id,
    name: folder.name,
    scope: folder.scope,
    sortOrder: folder.sort_order,
    isVisible: folder.is_visible,
  };
}

async function allowScope(userId: string, value: "standard" | "adult") {
  return value !== "adult" || (await getAnimePreferences(userId)).adultModeEnabled;
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "請輸入有效的資料夾名稱。" }, { status: 400 });
  if (!(await allowScope(context.userId, parsed.data.scope))) return NextResponse.json({ error: "請先啟用成人內容模式。" }, { status: 403 });
  const admin = createAdminClient();
  const { data: last } = await admin.from("anime_folders").select("sort_order").eq("user_id", context.userId).eq("scope", parsed.data.scope).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("anime_folders").insert({ user_id: context.userId, scope: parsed.data.scope, name: parsed.data.name, sort_order: (last?.sort_order ?? -1) + 1 }).select("id,name,scope,sort_order,is_visible").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "此資料夾名稱已存在。" : "無法新增動漫資料夾。" }, { status: 503 });
  return NextResponse.json({ folder: serializeFolder(data) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "資料夾設定不正確。" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.sortOrder !== undefined) updates.sort_order = parsed.data.sortOrder;
  if (parsed.data.isVisible !== undefined) updates.is_visible = parsed.data.isVisible;
  const { data, error } = await createAdminClient().from("anime_folders").update(updates).eq("id", parsed.data.id).eq("user_id", context.userId).select("id,name,scope,sort_order,is_visible").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "找不到或無法修改此資料夾。" }, { status: 404 });
  return NextResponse.json({ folder: serializeFolder(data) });
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "找不到要移除的資料夾。" }, { status: 400 });
  const { error } = await createAdminClient().from("anime_folders").delete().eq("id", parsed.data.id).eq("user_id", context.userId);
  if (error) return NextResponse.json({ error: "無法移除資料夾。" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
