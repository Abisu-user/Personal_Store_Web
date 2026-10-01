import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { callPushDispatcher } from "@/lib/calendar/push-dispatcher";

export const dynamic = "force-dynamic";
const schema = z.object({ subscriptionId: z.string().uuid() });
const headers = { "Cache-Control": "private, no-store" };
// Best-effort burst guard per server instance; never used as an authorization boundary.
const recent = new Map<string, number>();

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400, headers });
  const { data, error } = await createAdminClient().from("calendar_push_subscriptions")
    .select("id").eq("id", parsed.data.subscriptionId).eq("owner_id", context.userId).eq("enabled", true).maybeSingle();
  if (error) return NextResponse.json({ ok: false, code: "SUBSCRIPTION_READ_FAILED" }, { status: 503, headers });
  if (!data) return NextResponse.json({ ok: false, code: "SUBSCRIPTION_NOT_REGISTERED" }, { status: 404, headers });
  const now = Date.now();
  for (const [key, timestamp] of recent) if (now - timestamp > 15_000) recent.delete(key);
  if (recent.has(data.id)) return NextResponse.json({ ok: false, code: "TEST_RATE_LIMITED" }, { status: 429, headers: { ...headers, "Retry-After": "15" } });
  recent.set(data.id, now);
  const result = await callPushDispatcher({ action: "test", ownerId: context.userId, subscriptionId: data.id });
  const status = result.ok ? 200 : result.code === "SUBSCRIPTION_EXPIRED" ? 410 : 503;
  // No endpoint, provider body, private key or raw exception is returned.
  console.info("[calendar-test-push]", { subscriptionId: data.id, code: result.code, providerStatus: result.providerStatus ?? null });
  return NextResponse.json(result, { status, headers });
}
