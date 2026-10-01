/** Local diagnostic history only. Never stores endpoint, auth, p256dh or VAPID values. */
export type PushTestHistory = {
  acceptedAt: string;
  last_confirmed_received_at: string | null;
};

function key(accountId: string, subscriptionId: string) {
  return `calendar-test-push:${accountId}:${subscriptionId}`;
}

export function readPushTestHistory(accountId: string, subscriptionId: string): PushTestHistory | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(accountId, subscriptionId)) || "null");
    if (!value || typeof value.acceptedAt !== "string" || !Number.isFinite(Date.parse(value.acceptedAt))) return null;
    return { acceptedAt: value.acceptedAt, last_confirmed_received_at:
      typeof value.last_confirmed_received_at === "string" && Number.isFinite(Date.parse(value.last_confirmed_received_at))
        ? value.last_confirmed_received_at : null };
  } catch { return null; }
}

export function writePushTestHistory(accountId: string, subscriptionId: string, history: PushTestHistory) {
  try { localStorage.setItem(key(accountId, subscriptionId), JSON.stringify({ acceptedAt: history.acceptedAt,
    last_confirmed_received_at: history.last_confirmed_received_at })); } catch { /* Storage may be unavailable; keep the in-memory result. */ }
}
