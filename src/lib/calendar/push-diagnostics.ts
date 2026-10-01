/** Shared diagnostic model. None of these fields contain push credentials. */
export type PushConfiguration = Record<string, "configured" | "missing">;

export type PushTestOutcome = {
  serverConfigured: boolean | null;
  subscriptionFound: boolean | null;
  pushAttempted: boolean | null;
  pushProviderStatus: number | null;
  invalidSubscription: boolean;
};

export type PushServerConfig = {
  publicKey: string;
  accountId: string;
  buildId: string;
  productionOrigin: string | null;
  dispatcher: "ready" | "unconfigured" | "unreachable" | "key-mismatch";
  dispatcherCode: string | null;
  configuration?: { vercel: PushConfiguration; edge: PushConfiguration | null };
};

export type PushDeviceRecord = {
  id: string;
  enabled: boolean;
  lastSyncedAt: string;
};

export type PushDiagnostics = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  workerActive: boolean;
  workerScope: string | null;
  workerVersion: string | null;
  subscriptionExists: boolean;
  keyMatches: boolean;
  server: PushDeviceRecord | null;
  config: PushServerConfig | null;
  error: string | null;
};

export function notificationRegistered(value: PushDiagnostics) {
  return value.supported && value.permission === "granted" && value.workerActive &&
    value.subscriptionExists && value.keyMatches && Boolean(value.server?.enabled);
}

export function notificationEnabled(value: PushDiagnostics) {
  return notificationRegistered(value) && value.config?.dispatcher === "ready" && !value.error;
}

export function maskSubscriptionId(id: string | null | undefined) {
  return id ? `${id.slice(0, 8)}…${id.slice(-4)}` : "尚未登記";
}

export function decodeVapidKey(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export function subscriptionKeyMatches(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options.applicationServerKey;
  if (!current || !publicKey) return false;
  const left = new Uint8Array(current);
  const right = decodeVapidKey(publicKey);
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
