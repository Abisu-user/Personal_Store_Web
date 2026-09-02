import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";

const ids = z.array(z.string().uuid()).min(1).max(100).refine((value) => new Set(value).size === value.length, "Duplicate IDs are not allowed.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move"), ids, categoryId: z.string().uuid().nullable() }),
  z.object({ action: z.literal("delete"), ids }),
]);

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "請選擇至少一筆有效的保管資料。" }, { status: 400 });
  try {
    const admin = createAdminClient();
    if (parsed.data.action === "move" && parsed.data.categoryId) {
      const { data: category, error: categoryError } = await admin.from("categories").select("id").eq("id", parsed.data.categoryId).eq("owner_id", context.userId).eq("content_kind", "vault_item").is("folder_id", null).maybeSingle();
      if (categoryError) throw categoryError;
      if (!category) return NextResponse.json({ error: "找不到指定的保管庫分類。" }, { status: 400 });
    }
    const { data, error } = parsed.data.action === "move"
      ? await admin.from("entries").update({ category_id: parsed.data.categoryId }).eq("owner_id", context.userId).eq("kind", "vault_item").is("deleted_at", null).in("id", parsed.data.ids).select("id")
      : await admin.from("entries").delete().eq("owner_id", context.userId).eq("kind", "vault_item").is("deleted_at", null).in("id", parsed.data.ids).select("id");
    if (error) throw error;
    const affectedIds = (data ?? []).map((item: { id: string }) => item.id);
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: parsed.data.action === "move" ? "vault_items_category_changed" : "vault_items_deleted", metadata: { count: affectedIds.length }, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true, affectedIds }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "無法批量更新保管庫項目。" }, { status: 503 }); }
}
