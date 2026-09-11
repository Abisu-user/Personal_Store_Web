import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";
import { mutateEntryTaxonomy } from "@/lib/content/entry-taxonomy";

const ids = z.array(z.string().uuid()).min(1).max(100).refine((value) => new Set(value).size === value.length, "Duplicate IDs are not allowed.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move"), ids, categoryId: z.string().uuid().nullable() }),
  z.object({ action: z.literal("organize"), ids, categoryIds: z.array(z.string().uuid()).max(30), relationMode: z.enum(["add", "remove", "replace"]) }),
  z.object({ action: z.literal("delete"), ids }),
]);

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "請選擇至少一筆有效的保管資料。" }, { status: 400 });
  try {
    const admin = createAdminClient();
    let affectedIds: string[];
    if (parsed.data.action === "delete") {
      const { data, error } = await admin.from("entries").delete().eq("owner_id", context.userId).eq("kind", "vault_item").is("deleted_at", null).in("id", parsed.data.ids).select("id");
      if (error) throw error;
      affectedIds = (data ?? []).map((item: { id: string }) => item.id);
    } else {
      const categoryIds = parsed.data.action === "move" ? (parsed.data.categoryId ? [parsed.data.categoryId] : []) : parsed.data.categoryIds;
      const relationMode = parsed.data.action === "move" ? "replace" : parsed.data.relationMode;
      await mutateEntryTaxonomy(context.userId, parsed.data.ids, "vault_item", categoryIds, [], relationMode, "content");
      affectedIds = parsed.data.ids;
    }
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: parsed.data.action === "delete" ? "vault_items_deleted" : "vault_items_category_changed", metadata: { count: affectedIds.length }, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true, affectedIds }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "無法批量更新保管庫項目。" }, { status: 503 }); }
}
