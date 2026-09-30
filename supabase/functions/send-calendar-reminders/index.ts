// Deploy with --no-verify-jwt; the private cron secret below is mandatory.
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import webPush from "npm:web-push@3.6.7";

type Claimed = {
  delivery_id: string; owner_id: string; event_id: string; reminder_id: string;
  occurrence_date: string; event_revision: number; event_title: string; offset_minutes: number;
};
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

const url = Deno.env.get("SUPABASE_URL") ?? "";
const namedKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
const serviceKey = (namedKeys ? (JSON.parse(namedKeys) as Record<string, string>).default : "") ||
  Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const dispatchSecret = Deno.env.get("CALENDAR_DISPATCH_SECRET") ?? "";
const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const subject = Deno.env.get("VAPID_SUBJECT") ?? "";
// Keep module initialization safe when deployment secrets have not been configured yet.
const admin = createClient(url || "https://unconfigured.invalid", serviceKey || "unconfigured", { auth: { persistSession: false } });

function reminderBody(minutes: number) {
  if (minutes === 0) return "現在開始";
  if (minutes === 1440) return "明天";
  if (minutes % 1440 === 0) return `${minutes / 1440} 天後開始`;
  if (minutes % 60 === 0) return `${minutes / 60} 小時後開始`;
  return `${minutes} 分鐘後開始`;
}

async function updateDelivery(id: string, status: "sent" | "failed" | "skipped", message?: string) {
  const { error } = await admin.from("calendar_notification_deliveries").update({
    status, sent_at: status === "sent" ? new Date().toISOString() : null,
    error_message: message?.slice(0, 300) ?? null,
  }).eq("id", id).eq("status", "claimed");
  if (error) console.error("[calendar-push] delivery update failed", id, error.message);
}

async function send(claim: Claimed) {
  // Recheck after the atomic claim: edits/deletes may have happened before the network call.
  const [event, reminder, subscriptions] = await Promise.all([
    admin.from("calendar_events").select("id, reminder_revision").eq("id", claim.event_id).eq("owner_id", claim.owner_id).maybeSingle(),
    admin.from("calendar_event_reminders").select("id").eq("id", claim.reminder_id).eq("owner_id", claim.owner_id).maybeSingle(),
    admin.from("calendar_push_subscriptions").select("id, endpoint, p256dh, auth").eq("owner_id", claim.owner_id).eq("enabled", true),
  ]);
  if (event.error || reminder.error || subscriptions.error) {
    await updateDelivery(claim.delivery_id, "failed", "Database read failed");
    return;
  }
  if (!event.data || event.data.reminder_revision !== claim.event_revision || !reminder.data) {
    await updateDelivery(claim.delivery_id, "skipped", "Event or reminder changed");
    return;
  }
  const devices = (subscriptions.data ?? []) as Subscription[];
  if (!devices.length) { await updateDelivery(claim.delivery_id, "skipped", "No enabled device"); return; }
  const payload = JSON.stringify({
    title: claim.event_title, body: reminderBody(claim.offset_minutes),
    url: `/calendar?date=${claim.occurrence_date}&event=${claim.event_id}`,
    tag: claim.delivery_id,
  });
  const results = await Promise.allSettled(devices.map(async (device) => {
    try {
      await webPush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, { TTL: 3600 });
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from("calendar_push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("id", device.id).eq("owner_id", claim.owner_id);
      }
      console.warn("[calendar-push] endpoint failed", claim.delivery_id, status ?? "unknown");
      return false;
    }
  }));
  const success = results.some((result) => result.status === "fulfilled" && result.value);
  await updateDelivery(claim.delivery_id, success ? "sent" : "failed", success ? undefined : "No device accepted the push");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!dispatchSecret || request.headers.get("x-calendar-dispatch-secret") !== dispatchSecret) return new Response("Unauthorized", { status: 401 });
  if (!url || !serviceKey || !publicKey || !privateKey || !subject) return new Response("Push is not configured", { status: 503 });
  webPush.setVapidDetails(subject, publicKey, privateKey);
  const { data, error } = await admin.rpc("claim_due_calendar_reminders", { p_limit: 200 });
  if (error) { console.error("[calendar-push] claim failed", error.message); return new Response("Claim failed", { status: 503 }); }
  const claims = (data ?? []) as Claimed[];
  // Bounded batches avoid overwhelming the Edge Function or push providers.
  for (let index = 0; index < claims.length; index += 10) {
    await Promise.all(claims.slice(index, index + 10).map(send));
  }
  return Response.json({ claimed: claims.length });
});
