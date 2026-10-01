// Read-only configuration probe. Run with --conditions=react-server and existing server env.
// Never prints environment values, endpoints, raw exceptions or provider payloads.
async function main() {
  const { callPushDispatcher } = await import("../../src/lib/calendar/push-dispatcher.ts");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.CALENDAR_DISPATCH_SECRET || !process.env.VAPID_PUBLIC_KEY) {
    console.log("Required server env is unavailable to this local command. This does not prove it is missing in Production.");
    process.exitCode = 1; return;
  }
  const result = await callPushDispatcher({ action: "diagnostics" });
  const codes = new Set(["DISPATCH_READY", "SERVER_NOT_CONFIGURED", "EDGE_NOT_CONFIGURED", "EDGE_UPDATE_REQUIRED", "DISPATCH_UNAUTHORIZED", "DISPATCH_UNREACHABLE", "VAPID_CONFIG_INVALID", "VAPID_KEY_MISMATCH"]);
  console.log(JSON.stringify({ code: codes.has(result.code) ? result.code : "UNKNOWN_STATUS",
    serverConfigured: result.serverConfigured ?? null, pushAttempted: result.pushAttempted ?? null,
    configuration: result.configuration, vapidValidation: result.vapidValidation }, null, 2));
}
main().catch(() => { console.error("Diagnostic probe failed; raw exception intentionally withheld."); process.exitCode = 1; });
