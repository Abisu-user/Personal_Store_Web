// Dedicated server-only diagnostic function. It never queries reminder rules or invokes cron.
// Deploy with --no-verify-jwt; the private dispatch header is always required.
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import webPush from "npm:web-push@3.6.7";
import { providerFailure, validDeviceRequest } from "./policy.ts";

Deno.serve(async (request) => {
  const outcome: Record<string, unknown> = { serverConfigured: null, subscriptionFound: null,
    pushAttempted: false, invalidSubscription: false };
  const respond = (body: Record<string, unknown>, status = 200) => Response.json({ ...outcome, ...body }, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return respond({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const secret = Deno.env.get("CALENDAR_DISPATCH_SECRET");
  if (!secret || request.headers.get("x-calendar-dispatch-secret") !== secret) return respond({ ok: false, code: "DISPATCH_UNAUTHORIZED" }, 401);
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  const url = Deno.env.get("SUPABASE_URL");
  let serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try { serviceKey = serviceKey || JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; } catch { /* Invalid secret metadata. */ }
  // Only presence is exposed, and only after authenticating the private dispatch header.
  // SUPABASE_SERVICE_ROLE_KEY represents the existing accepted admin-key fallbacks above.
  outcome.configuration = Object.fromEntries(Object.entries({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: subject, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, CALENDAR_DISPATCH_SECRET: secret })
    .map(([name, value]) => [name, value ? "configured" : "missing"]));
  outcome.serverConfigured = false;
  if (!publicKey || !privateKey || !subject || !url || !serviceKey) return respond({ ok: false, code: "EDGE_NOT_CONFIGURED" }, 503);
  const body = await request.json().catch(() => null);
  if (body?.expectedPublicKey !== publicKey) return respond({ ok: false, code: "VAPID_KEY_MISMATCH" }, 409);
  try { webPush.setVapidDetails(subject, publicKey, privateKey); } catch { return respond({ ok: false, code: "VAPID_CONFIG_INVALID" }, 503); }
  outcome.serverConfigured = true;
  if (body?.action === "diagnostics") return respond({ ok: true, code: "DISPATCH_READY" });
  if (body?.action !== "test" || !validDeviceRequest(body)) return respond({ ok: false, code: "INVALID_TEST_REQUEST" }, 400);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: device, error } = await admin.from("calendar_push_subscriptions")
    .select("id, endpoint, p256dh, auth").eq("id", body.subscriptionId).eq("owner_id", body.ownerId).eq("enabled", true).maybeSingle();
  if (error) return respond({ ok: false, code: "SUBSCRIPTION_READ_FAILED" }, 503);
  outcome.subscriptionFound = Boolean(device);
  if (!device) return respond({ ok: false, code: "SUBSCRIPTION_NOT_REGISTERED" }, 404);
  const runId = crypto.randomUUID();
  try {
    outcome.pushAttempted = true;
    const result = await webPush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify({
      type: "calendar-test", title: "Personal Store · 測試通知",
      body: "如果你看到這則通知，代表此裝置 Web Push 正常。",
      url: "/calendar", tag: `calendar-test-${runId}`,
    }), { TTL: 300, timeout: 10_000 });
    const acceptedAt = new Date().toISOString();
    console.info(JSON.stringify({ type: "calendar-test-push", runId, subscriptionId: device.id, code: "PUSH_ACCEPTED", providerStatus: result.statusCode, acceptedAt }));
    return respond({ ok: true, code: "PUSH_ACCEPTED", providerStatus: result.statusCode, subscriptionId: device.id, acceptedAt });
  } catch (failure) {
    const rawStatus = (failure as { statusCode?: unknown }).statusCode;
    const providerStatus = typeof rawStatus === "number" ? rawStatus : undefined;
    const code = providerFailure(providerStatus);
    if (code === "SUBSCRIPTION_EXPIRED") {
      const { error: disableError } = await admin.from("calendar_push_subscriptions")
        .update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", device.id).eq("owner_id", body.ownerId);
      if (disableError) console.error(JSON.stringify({ type: "calendar-test-push", runId, subscriptionId: device.id, code: "DISABLE_FAILED" }));
    }
    console.warn(JSON.stringify({ type: "calendar-test-push", runId, subscriptionId: device.id, code, providerStatus: providerStatus ?? null }));
    return respond({ ok: false, code, providerStatus, subscriptionId: device.id,
      invalidSubscription: code === "SUBSCRIPTION_EXPIRED" }, code === "SUBSCRIPTION_EXPIRED" ? 410 : 502);
  }
});
