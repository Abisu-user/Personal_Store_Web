import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCalendarWorkspaceData } from "@/lib/calendar/data";
import { isValidDateKey, rangeForMonth } from "@/lib/calendar/recurrence";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const eventSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  eventDate: z.string().refine(isValidDateKey, "日期格式不正確。"),
  eventTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  allDay: z.boolean(),
  recurrenceType: z.enum(["none", "yearly"]),
  color: z.enum(["indigo", "blue", "green", "amber", "rose"]),
}).refine((event) => event.allDay || event.eventTime !== null, { message: "請設定行程時間。", path: ["eventTime"] })
  .refine((event) => !event.endsAt || new Date(event.endsAt) >= new Date(event.startsAt), { message: "結束時間必須晚於開始時間。", path: ["endsAt"] });
const updateSchema = eventSchema.safeExtend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) { return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } }); }
function privateJson(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } }); }

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const defaults = rangeForMonth(new Date());
  const from = request.nextUrl.searchParams.get("from") ?? defaults.from;
  const to = request.nextUrl.searchParams.get("to") ?? defaults.to;
  if (!isValidDateKey(from) || !isValidDateKey(to) || from > to || (new Date(to).getTime() - new Date(from).getTime()) > 160 * 86_400_000) {
    return jsonError("日期範圍不正確。", 400);
  }
  try { return privateJson(await getCalendarWorkspaceData(context.userId, from, to)); }
  catch { return jsonError("日曆暫時無法讀取。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "請檢查行程欄位。", 400);
  const event = parsed.data;
  try {
    const { data, error } = await createAdminClient().from("calendar_events").insert({
      id: event.id, owner_id: context.userId, title: event.title, description: event.description || null,
      starts_at: event.startsAt, ends_at: event.allDay ? null : event.endsAt ?? null,
      event_date: event.eventDate, event_time: event.allDay ? null : event.eventTime,
      all_day: event.allDay, recurrence_type: event.recurrenceType, color: event.color,
    }).select("id").single();
    if (error?.code === "23505" && event.id) {
      const existing = await createAdminClient().from("calendar_events").select("id").eq("id", event.id).eq("owner_id", context.userId).maybeSingle();
      if (existing.data) return privateJson({ id: existing.data.id }, 200);
    }
    if (error) throw error;
    await createAdminClient().from("audit_logs").insert({ owner_id: context.userId, action: "calendar_event_created", metadata: { color: event.color }, ip_hash: context.ipHash });
    return privateJson({ id: data.id }, 201);
  } catch { return jsonError("無法新增行程，請稍後再試。", 503); }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "請檢查行程欄位。", 400);
  const event = parsed.data;
  try {
    const { data, error } = await createAdminClient().from("calendar_events").update({
      title: event.title, description: event.description || null, starts_at: event.startsAt,
      ends_at: event.allDay ? null : event.endsAt ?? null, event_date: event.eventDate,
      event_time: event.allDay ? null : event.eventTime, all_day: event.allDay,
      recurrence_type: event.recurrenceType, color: event.color,
    }).eq("id", event.id).eq("owner_id", context.userId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("找不到行程。", 404);
    await createAdminClient().from("audit_logs").insert({ owner_id: context.userId, action: "calendar_event_updated", metadata: { color: event.color }, ip_hash: context.ipHash });
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
