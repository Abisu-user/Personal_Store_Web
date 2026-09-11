import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";
import { mutateEntryTaxonomy } from "@/lib/content/entry-taxonomy";

const categoryName = z.string().trim().min(1).max(80);
const createSchema = z.object({ name: categoryName });
const updateSchema = z.object({ id: z.string().uuid(), name: categoryName.optional(), sortOrder: z.number().int().min(0).max(100_000).optional() }).refine((value) => value.name !== undefined || value.sortOrder !== undefined);
const deleteSchema = z.object({ id: z.string().uuid(), reassignToId: z.string().uuid().nullable() });
const defaultCategories = ["網站登入", "API Key", "Recovery Code", "銀行", "其他"];
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

async function ensureDefaults(ownerId: string) {
  const admin = createAdminClient();
  const { data: existing, error } = await admin.from("categories").select("name").eq("owner_id", ownerId).eq("content_kind", "vault_item");
  if (error) throw error;
  // Defaults are a first-run convenience only. Re-adding every missing name here
  // would make a deliberately deleted category appear again after a refresh.
  if ((existing ?? []).length === 0) { const { error: insertError } = await admin.from("categories").insert(defaultCategories.map((name, sortOrder) => ({ owner_id: ownerId, content_kind: "vault_item", folder_id: null, name, sort_order: sortOrder }))); if (insertError && insertError.code !== "23505") throw insertError; }
}

async function listCategories(ownerId: string) {
  const admin = createAdminClient();
  const { data: categories, error } = await admin.from("categories").select("id, name, sort_order").eq("owner_id", ownerId).eq("content_kind", "vault_item").is("folder_id", null).order("sort_order").order("created_at");
  if (error) throw error;
  const { data: items, error: itemError } = await admin.from("entry_category_links").select("category_id").eq("owner_id", ownerId);
  if (itemError) throw itemError;
  const counts = new Map<string, number>(); for (const item of items ?? []) { if (item.category_id) counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1); }
  return (categories ?? []).map((category) => ({ id: category.id, name: category.name, sortOrder: category.sort_order, itemCount: counts.get(category.id) ?? 0 }));
}

async function ownedCategory(ownerId: string, id: string) {
  const { data, error } = await createAdminClient().from("categories").select("id, name").eq("id", id).eq("owner_id", ownerId).eq("content_kind", "vault_item").is("folder_id", null).maybeSingle();
  if (error) throw error;
  return data;
}

export const dynamic = "force-dynamic";
export async function GET() {
  const context = await getSecurityContext(); if (!context) return fail("Unauthorized", 401);
  try { await ensureDefaults(context.userId); return NextResponse.json({ categories: await listCategories(context.userId) }, { headers }); } catch { return fail("無法讀取保管庫分類。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return fail("Unauthorized", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail("請輸入有效的分類名稱。", 400);
  try {
    await ensureDefaults(context.userId); const categories = await listCategories(context.userId); const { data, error } = await createAdminClient().from("categories").insert({ owner_id: context.userId, content_kind: "vault_item", folder_id: null, name: parsed.data.name, sort_order: categories.length }).select("id, name, sort_order").single();
    if (error?.code === "23505") return fail("此分類名稱已存在。", 409); if (error) throw error;
    await createAdminClient().from("audit_logs").insert({ owner_id: context.userId, action: "vault_category_created", metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true, category: { id: data.id, name: data.name, sortOrder: data.sort_order, itemCount: 0 } }, { status: 201, headers });
  } catch { return fail("無法新增保管庫分類。", 503); }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return fail("Unauthorized", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail("請輸入有效分類資料。", 400);
  try {
    const updates = { ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }), ...(parsed.data.sortOrder === undefined ? {} : { sort_order: parsed.data.sortOrder }) };
    const { data, error } = await createAdminClient().from("categories").update(updates).eq("id", parsed.data.id).eq("owner_id", context.userId).eq("content_kind", "vault_item").is("folder_id", null).select("id").maybeSingle();
    if (error?.code === "23505") return fail("此分類名稱已存在。", 409); if (error) throw error; if (!data) return fail("找不到分類。", 404);
    await createAdminClient().from("audit_logs").insert({ owner_id: context.userId, action: "vault_category_updated", metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { headers });
  } catch { return fail("無法更新保管庫分類。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return fail("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail("請選擇資料要移往的分類。", 400);
  try {
    const source = await ownedCategory(context.userId, parsed.data.id); if (!source) return fail("找不到分類。", 404);
    if (parsed.data.reassignToId === source.id) return fail("請選擇另一個分類。", 400);
    if (parsed.data.reassignToId && !(await ownedCategory(context.userId, parsed.data.reassignToId))) return fail("找不到指定的重新指派分類。", 400);
    const admin = createAdminClient(); const { data: affected, error: affectedError } = await admin.from("entry_category_links").select("entry_id").eq("owner_id", context.userId).eq("category_id", source.id); if (affectedError) throw affectedError;
    const affectedIds = [...new Set((affected ?? []).map((item) => item.entry_id))];
    if (affectedIds.length > 0 && parsed.data.reassignToId) await mutateEntryTaxonomy(context.userId, affectedIds, "vault_item", [parsed.data.reassignToId], [], "add", "content");
    if (affectedIds.length > 0) await mutateEntryTaxonomy(context.userId, affectedIds, "vault_item", [source.id], [], "remove", "content");
    const { error: deleteError } = await admin.from("categories").delete().eq("id", source.id).eq("owner_id", context.userId).eq("content_kind", "vault_item").is("folder_id", null); if (deleteError) throw deleteError;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "vault_category_deleted", metadata: { reassigned_count: affectedIds.length }, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true, reassignedCount: affectedIds.length }, { headers });
  } catch { return fail("無法刪除保管庫分類。", 503); }
}
