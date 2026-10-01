import "server-only";

type DispatchResult = { ok: boolean; code: string; providerStatus?: number; subscriptionId?: string; acceptedAt?: string };

/** Dedicated function: diagnostics must never accidentally invoke an older cron dispatcher. */
export async function callPushDispatcher(body: Record<string, string>): Promise<DispatchResult> {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.CALENDAR_DISPATCH_SECRET;
  if (!projectUrl || !secret || !process.env.VAPID_PUBLIC_KEY) return { ok: false, code: "SERVER_NOT_CONFIGURED" };
  try {
    const response = await fetch(`${projectUrl}/functions/v1/send-calendar-test-push`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
      headers: { "Content-Type": "application/json", "x-calendar-dispatch-secret": secret },
      body: JSON.stringify({ ...body, expectedPublicKey: process.env.VAPID_PUBLIC_KEY }),
    });
    const result = await response.json().catch(() => null) as DispatchResult | null;
    // Old deployments return plain text or {claimed}; never call those diagnostics healthy.
    if (!result || typeof result.ok !== "boolean" || typeof result.code !== "string") {
      return { ok: false, code: response.status === 401 ? "DISPATCH_UNAUTHORIZED" : "EDGE_UPDATE_REQUIRED" };
    }
    return { ok: response.ok && result.ok, code: result.code,
      providerStatus: typeof result.providerStatus === "number" ? result.providerStatus : undefined,
      subscriptionId: result.subscriptionId, acceptedAt: result.acceptedAt };
  } catch {
    return { ok: false, code: "DISPATCH_UNREACHABLE" };
  }
}
