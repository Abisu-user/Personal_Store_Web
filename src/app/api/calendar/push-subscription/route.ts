import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(32).max(512), auth: z.string().min(16).max(512) }),
});
const deleteSchema = z.object({ endpoint: z.string().url().max(2048) });
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

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return failure("Unauthorized", 401);
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const endpoint = request.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ publicKey, enabled: false }, { headers });
  if (endpoint.length > 2048) return failure("Invalid endpoint", 400);
  const { data, error } = await createAdminClient().from("calendar_push_subscriptions")
    .select("id").eq("owner_id", context.userId).eq("endpoint", endpoint).eq("enabled", true).maybeSingle();
  if (error) return failure("無法讀取通知狀態。", 503);
  return NextResponse.json({ publicKey, enabled: Boolean(data) }, { headers });
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return failure("Unauthorized", 401);
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validPushEndpoint(parsed.data.endpoint)) return failure("通知訂閱資料不正確。", 400);
  const { endpoint, keys } = parsed.data;
  const { error } = await createAdminClient().from("calendar_push_subscriptions").upsert({
    owner_id: context.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth,
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    enabled: true, updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) return failure("無法儲存通知訂閱。", 503);
  return NextResponse.json({ ok: true }, { headers });
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
