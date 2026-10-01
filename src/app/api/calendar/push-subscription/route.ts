import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { callPushDispatcher, pushServerConfiguration } from "@/lib/calendar/push-dispatcher";

export const dynamic = "force-dynamic";
const subscriptionSchema = z.object({
  action: z.literal("sync").optional(),
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(32).max(512), auth: z.string().min(16).max(512) }),
});
const deleteSchema = z.object({ endpoint: z.string().url().max(2048) });
const inspectSchema = deleteSchema.extend({ action: z.literal("inspect") });
const headers = { "Cache-Control": "private, no-store" };
function failure(error: string, status: number) { return NextResponse.json({ error }, { status, headers }); }
function validPushEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && !url.port && !url.username && !url.password &&
    (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
      host === "web.push.apple.com" || host.endsWith(".push.apple.com") ||
      host.endsWith(".notify.windows.com"));
}

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return failure("Unauthorized", 401);
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const dispatch = await callPushDispatcher({ action: "diagnostics" });
  let productionOrigin: string | null = null;
  try { if (process.env.NEXT_PUBLIC_APP_URL) productionOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL).origin; } catch { /* Unknown, not a guessed production domain. */ }
  return NextResponse.json({ publicKey, accountId: context.userId,
    buildId: process.env.NEXT_PUBLIC_BUILD_ID || "unknown", productionOrigin,
    dispatcher: dispatch.ok ? "ready" : dispatch.code === "VAPID_KEY_MISMATCH" ? "key-mismatch" :
      dispatch.code === "DISPATCH_UNREACHABLE" ? "unreachable" : "unconfigured",
    dispatcherCode: dispatch.ok ? null : dispatch.code,
    configuration: { vercel: pushServerConfiguration(), edge: dispatch.configuration ?? null },
    vapidValidation: dispatch.vapidValidation,
  }, { headers });
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return failure("Unauthorized", 401);
  const body = await request.json().catch(() => null);
  if (body?.action === "inspect") {
    const parsed = inspectSchema.safeParse(body);
    if (!parsed.success || !validPushEndpoint(parsed.data.endpoint)) return failure("通知訂閱資料不正確。", 400);
    const { data, error } = await createAdminClient().from("calendar_push_subscriptions")
      .select("id, enabled, updated_at").eq("owner_id", context.userId).eq("endpoint", parsed.data.endpoint).maybeSingle();
    if (error) return failure("無法讀取伺服器訂閱。", 503);
    return NextResponse.json({ device: data ? { id: data.id, enabled: data.enabled, lastSyncedAt: data.updated_at } : null }, { headers });
  }
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success || !validPushEndpoint(parsed.data.endpoint)) return failure("通知訂閱資料不正確。", 400);
  const { endpoint, keys } = parsed.data;
  const { data, error } = await createAdminClient().from("calendar_push_subscriptions").upsert({
    owner_id: context.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth,
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    enabled: true, updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" }).select("id, enabled, updated_at").single();
  if (error) return failure("無法儲存通知訂閱。", 503);
  return NextResponse.json({ ok: true, device: { id: data.id, enabled: data.enabled, lastSyncedAt: data.updated_at } }, { headers });
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return failure("Unauthorized", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Invalid request", 400);
  const { error } = await createAdminClient().from("calendar_push_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("owner_id", context.userId).eq("endpoint", parsed.data.endpoint);
  if (error) return failure("無法關閉通知。", 503);
  return NextResponse.json({ ok: true }, { headers });
}
