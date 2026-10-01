import "server-only";
import type { PushConfiguration, PushTestOutcome } from "./push-diagnostics";

type DispatchResult = { ok: boolean; code: string; providerStatus?: number; subscriptionId?: string; acceptedAt?: string;
  configuration?: PushConfiguration } & Partial<PushTestOutcome>;

export function pushServerConfiguration(): PushConfiguration {
  return Object.fromEntries(["NEXT_PUBLIC_SUPABASE_URL", "CALENDAR_DISPATCH_SECRET", "VAPID_PUBLIC_KEY", "NEXT_PUBLIC_APP_URL"]
    .map((name) => [name, process.env[name] ? "configured" : "missing"]));
}

function safeEdgeConfiguration(value: unknown): PushConfiguration | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CALENDAR_DISPATCH_SECRET"]
    .filter((name) => record[name] === "configured" || record[name] === "missing")
    .map((name) => [name, record[name]])) as PushConfiguration;
}

/** Dedicated function: diagnostics must never accidentally invoke an older cron dispatcher. */
export async function callPushDispatcher(body: Record<string, string>): Promise<DispatchResult> {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.CALENDAR_DISPATCH_SECRET;
  if (!projectUrl || !secret || !process.env.VAPID_PUBLIC_KEY) return { ok: false, code: "SERVER_NOT_CONFIGURED",
    serverConfigured: false, pushAttempted: false };
  try {
    const response = await fetch(`${projectUrl}/functions/v1/send-calendar-test-push`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
      headers: { "Content-Type": "application/json", "x-calendar-dispatch-secret": secret },
      body: JSON.stringify({ ...body, expectedPublicKey: process.env.VAPID_PUBLIC_KEY }),
    });
    const result = await response.json().catch(() => null) as DispatchResult | null;
    // Old deployments return plain text or {claimed}; never call those diagnostics healthy.
    if (!result || typeof result.ok !== "boolean" || typeof result.code !== "string") {
      return { ok: false, code: response.status === 401 ? "DISPATCH_UNAUTHORIZED" : "EDGE_UPDATE_REQUIRED",
        serverConfigured: null, pushAttempted: null };
    }
    const accepted = body.action === "test" ? result.code === "PUSH_ACCEPTED" &&
      typeof result.providerStatus === "number" && result.providerStatus >= 200 && result.providerStatus < 300 : result.code === "DISPATCH_READY";
    return { ok: response.ok && result.ok && accepted, code: result.code,
      providerStatus: typeof result.providerStatus === "number" ? result.providerStatus : undefined,
      subscriptionId: typeof result.subscriptionId === "string" ? result.subscriptionId : undefined,
      acceptedAt: typeof result.acceptedAt === "string" ? result.acceptedAt : undefined,
      configuration: safeEdgeConfiguration(result.configuration),
      serverConfigured: typeof result.serverConfigured === "boolean" ? result.serverConfigured : result.ok ? true : null,
      subscriptionFound: typeof result.subscriptionFound === "boolean" ? result.subscriptionFound : null,
      pushAttempted: typeof result.pushAttempted === "boolean" ? result.pushAttempted : null,
      invalidSubscription: result.code === "SUBSCRIPTION_EXPIRED" };
  } catch {
    // Timeout cannot prove whether the Edge function already contacted the provider.
    return { ok: false, code: "DISPATCH_UNREACHABLE", serverConfigured: null, pushAttempted: null };
  }
}
