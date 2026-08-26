import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";

const taxonomyKind = z.enum(["category", "tag", "bookmark_folder"]);
const contentKind = z.enum(["bookmark", "note", "code", "file", "photo"]);
const inputSchema = z.object({ kind: taxonomyKind, name: z.string().trim().min(1).max(80), contentKind: contentKind.optional(), folderId: z.string().uuid().nullable().optional() });
const deleteSchema = z.object({ kind: taxonomyKind, id: z.string().uuid(), contentKind: contentKind.optional() });
const updateSchema = z.object({ kind: taxonomyKind, id: z.string().uuid(), name: z.string().trim().min(1).max(80).optional(), visible: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional(), contentKind: contentKind.optional() }).refine((value) => value.name !== undefined || value.visible !== undefined || value.sortOrder !== undefined);
function response(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }
function tableFor(kind: z.infer<typeof taxonomyKind>) { return kind === "category" ? "categories" : kind === "tag" ? "tags" : "bookmark_folders"; }
function selectFor(kind: z.infer<typeof taxonomyKind>) { return kind === "tag" ? "id, name, color" : kind === "bookmark_folder" ? "id, name, sort_order, is_visible" : "id, name, sort_order, folder_id"; }
async function categoryFolderExists(ownerId: string, kind: z.infer<typeof contentKind>, folderId: string | null | undefined) {
  if (!folderId) return true;
  const admin = createAdminClient() as any;
  const table = kind === "bookmark" ? "bookmark_folders" : "content_folders";
  let query = admin.from(table).select("id").eq("id", folderId).eq("owner_id", ownerId);
  if (kind !== "bookmark") query = query.eq("content_kind", kind);
  const { data } = await query.maybeSingle();
  return Boolean(data);
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return response("Unauthorized", 401);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return response("請輸入有效名稱。", 400);
  try {
    const admin = createAdminClient() as any; const table = tableFor(parsed.data.kind);
    const scopedKind = parsed.data.contentKind ?? "bookmark";
    if (parsed.data.kind === "category" && !(await categoryFolderExists(context.userId, scopedKind, parsed.data.folderId))) return response("找不到指定資料夾。", 400);
    const insert = parsed.data.kind === "category" ? { owner_id: context.userId, name: parsed.data.name, content_kind: scopedKind, folder_id: parsed.data.folderId ?? null } : { owner_id: context.userId, name: parsed.data.name };
    const { data, error } = await admin.from(table).insert(insert).select(selectFor(parsed.data.kind)).single();
    if (error?.code === "23505") return response("此名稱已存在。", 409);
    if (error) throw error;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: `${parsed.data.kind}_created`, metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true, item: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch { return response("無法建立分類、標籤或收藏資料夾。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return response("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return response("Invalid request", 400);
  try {
    const admin = createAdminClient() as any; const table = tableFor(parsed.data.kind);
    let query = admin.from(table).delete().eq("id", parsed.data.id).eq("owner_id", context.userId);
    if (parsed.data.kind === "category") query = query.eq("content_kind", parsed.data.contentKind ?? "bookmark");
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw error; if (!data) return response("Not found", 404);
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: `${parsed.data.kind}_deleted`, metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true });
  } catch { return response("無法刪除分類、標籤或收藏資料夾。", 503); }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return response("Unauthorized", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return response("請輸入有效資料。", 400);
  try {
    const admin = createAdminClient() as any; const table = tableFor(parsed.data.kind);
    const updates = parsed.data.kind === "bookmark_folder"
      ? { ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }), ...(parsed.data.visible === undefined ? {} : { is_visible: parsed.data.visible }), ...(parsed.data.sortOrder === undefined ? {} : { sort_order: parsed.data.sortOrder }) }
      : parsed.data.kind === "category"
        ? { ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }), ...(parsed.data.sortOrder === undefined ? {} : { sort_order: parsed.data.sortOrder }) }
        : { name: parsed.data.name };
    let query = admin.from(table).update(updates).eq("id", parsed.data.id).eq("owner_id", context.userId);
    if (parsed.data.kind === "category") query = query.eq("content_kind", parsed.data.contentKind ?? "bookmark");
    const { data, error } = await query.select("id").maybeSingle();
    if (error?.code === "23505") return response("此名稱已存在。", 409);
    if (error) throw error; if (!data) return response("Not found", 404);
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: `${parsed.data.kind}_updated`, metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true });
  } catch { return response("無法更新分類、標籤或收藏資料夾。", 503); }
}
