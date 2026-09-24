"use client";

/** Best-effort activity signal. Opening content must never wait for telemetry. */
export function recordDashboardOpen(id: string) {
  void fetch("/api/dashboard/desktop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
    keepalive: true,
  }).catch(() => undefined);
}
