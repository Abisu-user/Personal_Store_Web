import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const contentKind = z.enum(["note", "code", "file", "photo"]);
const createSchema = z.object({ kind: contentKind, name: z.string().trim().min(1).max(80) });
const updateSchema = z.object({ id: z.string().uuid(), kind: contentKind, name: z.string().trim().min(1).max(80).optional(), visible: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional() }).refine((value) => value.name !== undefined || value.visible !== undefined || value.sortOrder !== undefined);
const deleteSchema = z.object({ id: z.string().uuid(), kind: contentKind });

function error(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return error("Unauthorized", 401);
  const kind = contentKind.safeParse(request.nextUrl.searchParams.get("kind"));
  if (!kind.success) return error("Invalid kind", 400);
  const { data, error: queryError } = await createAdminClient().from("content_folders").select("id, name, sort_order, is_visible").eq("owner_id", context.userId).eq("content_kind", kind.data).order("sort_order").order("name");
  if (queryError) return error("無法讀取資料夾。", 503);
  return NextResponse.json({ folders: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return error("Unauthorized", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("請輸入有效資料夾名稱。", 400);
  const { data, error: queryError } = await createAdminClient().from("content_folders").insert({ owner_id: context.userId, content_kind: parsed.data.kind, name: parsed.data.name }).select("id, name, sort_order, is_visible").single();
  if (queryError?.code === "23505") return error("此資料夾名稱已存在。", 409);
  if (queryError) return error("無法建立資料夾。", 503);
  return NextResponse.json({ item: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return error("Unauthorized", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("請輸入有效資料。", 400);
  const updates = { ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }), ...(parsed.data.visible === undefined ? {} : { is_visible: parsed.data.visible }), ...(parsed.data.sortOrder === undefined ? {} : { sort_order: parsed.data.sortOrder }) };
  const { data, error: queryError } = await createAdminClient().from("content_folders").update(updates).eq("id", parsed.data.id).eq("owner_id", context.userId).eq("content_kind", parsed.data.kind).select("id").maybeSingle();
  if (queryError?.code === "23505") return error("此資料夾名稱已存在。", 409);
  if (queryError) return error("無法更新資料夾。", 503);
  if (!data) return error("找不到資料夾。", 404);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return error("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 400);
  const { data, error: queryError } = await createAdminClient().from("content_folders").delete().eq("id", parsed.data.id).eq("owner_id", context.userId).eq("content_kind", parsed.data.kind).select("id").maybeSingle();
  if (queryError) return error("無法移除資料夾。", 503);
  if (!data) return error("找不到資料夾。", 404);
  return NextResponse.json({ ok: true });
}
