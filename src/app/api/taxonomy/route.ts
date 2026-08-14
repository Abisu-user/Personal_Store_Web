import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";

const inputSchema = z.object({ kind: z.enum(["category", "tag"]), name: z.string().trim().min(1).max(50) });
const deleteSchema = z.object({ kind: z.enum(["category", "tag"]), id: z.string().uuid() });
function response(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return response("Unauthorized", 401);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return response("請輸入有效名稱。", 400);
  try {
    const admin = createAdminClient(); const table = parsed.data.kind === "category" ? "categories" : "tags";
    const { error } = await admin.from(table).insert({ owner_id: context.userId, name: parsed.data.name });
    if (error?.code === "23505") return response("此名稱已存在。", 409);
    if (error) throw error;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: `${parsed.data.kind}_created`, metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true });
  } catch { return response("無法建立分類或標籤。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return response("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return response("Invalid request", 400);
  try {
    const admin = createAdminClient(); const table = parsed.data.kind === "category" ? "categories" : "tags";
    const { data, error } = await admin.from(table).delete().eq("id", parsed.data.id).eq("owner_id", context.userId).select("id").maybeSingle();
    if (error) throw error; if (!data) return response("Not found", 404);
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: `${parsed.data.kind}_deleted`, metadata: {}, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true });
  } catch { return response("無法刪除分類或標籤。", 503); }
}
