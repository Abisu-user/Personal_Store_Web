import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCodeWorkspaceData } from "@/lib/code/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";

const snippetSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional(),
  language: z.string().trim().min(1).max(50),
  sourceCode: z.string().min(1).max(100_000),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
});
const updateSchema = snippetSchema.extend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function validateCategory(ownerId: string, categoryId: string | null | undefined) {
  if (!categoryId) return true;
  const { data } = await createAdminClient().from("categories").select("id").eq("id", categoryId).eq("owner_id", ownerId).maybeSingle();
  return Boolean(data);
}

async function resolveTags(ownerId: string, tags: string[]) {
  const names = [...new Set(tags.map((tag) => tag.toLocaleLowerCase("en-US")))];
  if (!names.length) return [] as { id: string }[];
  const { data, error } = await createAdminClient().from("tags").upsert(names.map((name) => ({ owner_id: ownerId, name })), { onConflict: "owner_id,name" }).select("id");
  if (error) throw error;
  return data ?? [];
}

async function replaceTags(entryId: string, tagIds: string[]) {
  const admin = createAdminClient();
  const { error: deleteError } = await admin.from("entry_tags").delete().eq("entry_id", entryId);
  if (deleteError) throw deleteError;
  if (!tagIds.length) return;
  const { error: insertError } = await admin.from("entry_tags").insert(tagIds.map((tagId) => ({ entry_id: entryId, tag_id: tagId })));
  if (insertError) throw insertError;
}

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  try { return NextResponse.json(await getCodeWorkspaceData(context.userId), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return jsonError("Code snippets are temporarily unavailable.", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = snippetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("請檢查程式碼片段欄位。", 400);
  if (!(await validateCategory(context.userId, parsed.data.categoryId))) return jsonError("找不到指定分類。", 400);
  let entryId: string | null = null;
  try {
    const admin = createAdminClient(); const tags = await resolveTags(context.userId, parsed.data.tags);
    const { data: entry, error: entryError } = await admin.from("entries").insert({ owner_id: context.userId, kind: "code", title: parsed.data.title, description: parsed.data.description || null, category_id: parsed.data.categoryId ?? null }).select("id").single();
    if (entryError) throw entryError;
    entryId = entry.id;
    const { error: detailError } = await admin.from("code_details").insert({ entry_id: entry.id, language: parsed.data.language, source_code: parsed.data.sourceCode });
    if (detailError) throw detailError;
    await replaceTags(entry.id, tags.map((tag) => tag.id));
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "code_created", entry_id: entry.id, metadata: { language: parsed.data.language, tag_count: tags.length }, ip_hash: context.ipHash });
    return NextResponse.json({ id: entry.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    if (entryId) await createAdminClient().from("entries").delete().eq("id", entryId).eq("owner_id", context.userId);
    return jsonError("無法建立程式碼片段，請稍後再試。", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("請檢查程式碼片段欄位。", 400);
  if (!(await validateCategory(context.userId, parsed.data.categoryId))) return jsonError("找不到指定分類。", 400);
  try {
    const admin = createAdminClient(); const tags = await resolveTags(context.userId, parsed.data.tags);
    const { data: entry, error: entryError } = await admin.from("entries").update({ title: parsed.data.title, description: parsed.data.description || null, category_id: parsed.data.categoryId ?? null }).eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "code").select("id").maybeSingle();
    if (entryError) throw entryError;
    if (!entry) return jsonError("找不到程式碼片段。", 404);
    const { error: detailError } = await admin.from("code_details").update({ language: parsed.data.language, source_code: parsed.data.sourceCode }).eq("entry_id", entry.id);
    if (detailError) throw detailError;
    await replaceTags(entry.id, tags.map((tag) => tag.id));
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "code_updated", entry_id: entry.id, metadata: { language: parsed.data.language, tag_count: tags.length }, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("無法儲存程式碼片段，請稍後再試。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request", 400);
  try {
    const admin = createAdminClient();
    const { data: entry, error } = await admin.from("entries").delete().eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "code").select("id").maybeSingle();
    if (error) throw error;
    if (!entry) return jsonError("找不到程式碼片段。", 404);
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "code_deleted", metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("無法刪除程式碼片段，請稍後再試。", 503); }
}
