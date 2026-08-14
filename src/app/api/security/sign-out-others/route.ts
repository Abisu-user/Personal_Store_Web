import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = await createClient();
    const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
    if (signOutError) throw signOutError;
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { error: revokeError } = await admin.from("device_sessions").update({ revoked_at: now }).eq("owner_id", context.userId).neq("auth_session_id", context.sessionId).is("revoked_at", null);
    if (revokeError) throw revokeError;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "other_sessions_revoked", metadata: {} });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to sign out other sessions." }, { status: 503 });
  }
}
