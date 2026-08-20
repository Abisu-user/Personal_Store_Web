import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCalendarWorkspaceData } from "@/lib/calendar/data";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const eventSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  color: z.enum(["indigo", "blue", "green", "amber", "rose"]),
}).refine((event) => !event.endsAt || new Date(event.endsAt) >= new Date(event.startsAt), { message: "結束時間必須晚於開始時間。", path: ["endsAt"] });

const updateSchema = eventSchema.extend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) { return NextResponse.json({ error }, { status }); }
function privateJson(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } }); }

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  try { return privateJson(await getCalendarWorkspaceData(context.userId)); }
  catch { return jsonError("日曆暫時無法讀取。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "請檢查行程欄位。", 400);
  try {
    const { data, error } = await createAdminClient().from("calendar_events").insert({
      owner_id: context.userId, title: parsed.data.title, description: parsed.data.description || null,
      starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt ?? null, color: parsed.data.color,
    }).select("id").single();
    if (error) throw error;
    await createAdminClient().from("audit_logs").insert({ owner_id: context.userId, action: "calendar_event_created", metadata: { color: parsed.data.color }, ip_hash: context.ipHash });
    return privateJson({ id: data.id }, 201);
  } catch { return jsonError("無法新增行程，請稍後再試。", 503); }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "請檢查行程欄位。", 400);
  try {
    const { data, error } = await createAdminClient().from("calendar_events").update({
      title: parsed.data.title, description: parsed.data.description || null, starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt ?? null, color: parsed.data.color,
    }).eq("id", parsed.data.id).eq("owner_id", context.userId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("找不到行程。", 404);
    await createAdminClient().from("audit_logs").insert({ owner_id: context.userId, action: "calendar_event_updated", metadata: { color: parsed.data.color }, ip_hash: context.ipHash });
    return privateJson({ ok: true });
  } catch { return jsonError("無法儲存行程，請稍後再試。", 503); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request", 400);
  try {
    const { data, error } = await createAdminClient().from("calendar_events").delete().eq("id", parsed.data.id).eq("owner_id", context.userId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("找不到行程。", 404);
    await createAdminClient().from("audit_logs").insert({ owner_id: context.userId, action: "calendar_event_deleted", metadata: {}, ip_hash: context.ipHash });
    return privateJson({ ok: true });
  } catch { return jsonError("無法刪除行程，請稍後再試。", 503); }
}
