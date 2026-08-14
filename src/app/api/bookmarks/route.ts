import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";

const bookmarkSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
});

function jsonError(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }
async function requireContext() { const context = await getSecurityContext(); return context; }

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireContext();
  if (!context) return jsonError("Unauthorized", 401);
  try {
    const admin = createAdminClient();
    const [entriesResult, categoriesResult, tagsResult] = await Promise.all([
      admin.from("entries").select("id, title, description, category_id, is_favorite, created_at, updated_at, categories(id, name), bookmark_details(url, site_title, notes), entry_tags(tags(id, name, color))").eq("owner_id", context.userId).eq("kind", "bookmark").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100),
      admin.from("categories").select("id, name, sort_order").eq("owner_id", context.userId).order("sort_order").order("name").limit(100),
      admin.from("tags").select("id, name, color").eq("owner_id", context.userId).order("name").limit(100),
    ]);
    if (entriesResult.error || categoriesResult.error || tagsResult.error) throw new Error("Unable to load bookmarks.");
    const bookmarks = (entriesResult.data ?? []).map((entry) => ({
      id: entry.id, title: entry.title, description: entry.description, favorite: entry.is_favorite, createdAt: entry.created_at, updatedAt: entry.updated_at,
      category: Array.isArray(entry.categories) ? entry.categories[0] ?? null : entry.categories,
      detail: Array.isArray(entry.bookmark_details) ? entry.bookmark_details[0] ?? null : entry.bookmark_details,
      tags: (entry.entry_tags ?? []).flatMap((item) => Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : []),
    }));
    return NextResponse.json({ bookmarks, categories: categoriesResult.data ?? [], tags: tagsResult.data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("Bookmarks are temporarily unavailable.", 503); }
}

export async function POST(request: NextRequest) {
  const context = await requireContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = bookmarkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("請確認書籤資料格式。", 400);
  let normalizedUrl: string;
  try { const url = new URL(parsed.data.url); if (!/^https?:$/.test(url.protocol)) throw new Error(); normalizedUrl = url.toString(); } catch { return jsonError("網址必須以 http:// 或 https:// 開頭。", 400); }
  try {
    const admin = createAdminClient();
    const tagNames = [...new Set(parsed.data.tags.map((tag) => tag.toLocaleLowerCase("en-US")))];
    if (parsed.data.categoryId) {
      const { data: category } = await admin.from("categories").select("id").eq("id", parsed.data.categoryId).eq("owner_id", context.userId).maybeSingle();
      if (!category) return jsonError("找不到指定分類。", 400);
    }
    let tagRows: { id: string }[] = [];
    if (tagNames.length) {
      const { data, error } = await admin.from("tags").upsert(tagNames.map((name) => ({ owner_id: context.userId, name })), { onConflict: "owner_id,name" }).select("id");
      if (error) throw error;
      tagRows = data ?? [];
    }
    const { data: entry, error: entryError } = await admin.from("entries").insert({ owner_id: context.userId, kind: "bookmark", title: parsed.data.title, description: parsed.data.description || null, category_id: parsed.data.categoryId ?? null }).select("id").single();
    if (entryError) throw entryError;
    const { error: detailsError } = await admin.from("bookmark_details").insert({ entry_id: entry.id, url: normalizedUrl, notes: parsed.data.description || null });
    if (detailsError) { await admin.from("entries").delete().eq("id", entry.id).eq("owner_id", context.userId); throw detailsError; }
    if (tagRows.length) { const { error } = await admin.from("entry_tags").insert(tagRows.map((tag) => ({ entry_id: entry.id, tag_id: tag.id }))); if (error) throw error; }
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "bookmark_created", entry_id: entry.id, metadata: { tag_count: tagRows.length, has_category: Boolean(parsed.data.categoryId) }, ip_hash: context.ipHash });
    return NextResponse.json({ id: entry.id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("無法儲存書籤，請稍後再試。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await requireContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request", 400);
  try {
    const admin = createAdminClient();
    const { data: entry, error } = await admin.from("entries").delete().eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "bookmark").select("id").maybeSingle();
    if (error) throw error;
    if (!entry) return jsonError("Not found", 404);
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "bookmark_deleted", metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("無法刪除書籤。", 503); }
}
