import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deviceLabel, getSecurityContext } from "@/lib/security/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const admin = createAdminClient();
    const [{ data: sessions, error: sessionsError }, { data: events, error: eventsError }] = await Promise.all([
      admin.from("device_sessions").select("id, auth_session_id, device_label, last_seen_at, created_at, revoked_at").eq("owner_id", context.userId).order("last_seen_at", { ascending: false }).limit(20),
      admin.from("audit_logs").select("id, action, metadata, occurred_at").eq("owner_id", context.userId).order("occurred_at", { ascending: false }).limit(30),
    ]);
    if (sessionsError || eventsError) throw new Error("Unable to load security activity.");
    return NextResponse.json({
      sessions: (sessions ?? []).map((session) => ({
        id: session.id,
        label: session.device_label ?? "Unknown device",
        lastSeenAt: session.last_seen_at,
        createdAt: session.created_at,
        revokedAt: session.revoked_at,
        current: session.auth_session_id === context.sessionId,
      })),
      events: events ?? [],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Security activity is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST() {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const admin = createAdminClient();
    const label = deviceLabel(context.userAgent);
    const { data: existing } = await admin.from("device_sessions").select("id").eq("owner_id", context.userId).eq("auth_session_id", context.sessionId).maybeSingle();
    let sessionId = existing?.id;
    if (sessionId) {
      const { error } = await admin.from("device_sessions").update({ device_label: label, user_agent: context.userAgent, ip_hash: context.ipHash, last_seen_at: new Date().toISOString(), revoked_at: null }).eq("id", sessionId).eq("owner_id", context.userId);
      if (error) throw error;
    } else {
      const { data, error } = await admin.from("device_sessions").insert({ owner_id: context.userId, auth_session_id: context.sessionId, device_label: label, user_agent: context.userAgent, ip_hash: context.ipHash }).select("id").single();
      if (error) throw error;
      sessionId = data.id;
      await admin.from("audit_logs").insert({ owner_id: context.userId, action: "session_observed", device_session_id: sessionId, metadata: { device: label }, ip_hash: context.ipHash });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to register this device." }, { status: 503 });
  }
}
