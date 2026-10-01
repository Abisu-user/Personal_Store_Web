import { decodeVapidKey, subscriptionKeyMatches, type PushDiagnostics, type PushServerConfig, type PushDeviceRecord } from "./push-diagnostics";

export function emptyPushDiagnostics(): PushDiagnostics {
  return { supported: false, permission: "unsupported", workerActive: false, workerScope: null,
    workerVersion: null, subscriptionExists: false, keyMatches: false, server: null, config: null, error: null };
}

async function bounded<T>(promise: Promise<T>, timeout: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); })]);
  } finally { clearTimeout(timer); }
}

export async function pushRequest<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000),
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? `通知伺服器無法連線（HTTP ${response.status}）。`);
  return result as T;
}

export async function activeWorkerVersion(worker: ServiceWorker): Promise<string | null> {
  const channel = new MessageChannel();
  try {
    return await bounded(new Promise<string | null>((resolve) => {
      channel.port1.onmessage = (event) => resolve(typeof event.data?.buildId === "string" ? event.data.buildId : null);
      worker.postMessage({ type: "PERSONAL_VAULT_VERSION" }, [channel.port2]);
    }), 1600, "Worker 未提供版本");
  } catch { return null; }
  finally { channel.port1.close(); channel.port2.close(); }
}

// Explicit opt-out preference only; never the source of truth for “已開啟”.
export function deviceOptedOut(accountId: string) {
  try { return localStorage.getItem(`calendar-push:opt-out:${accountId}`) === "true"; } catch { return false; }
}
export function setDeviceOptOut(accountId: string, off: boolean) {
  try {
    const key = `calendar-push:opt-out:${accountId}`;
    if (off) localStorage.setItem(key, "true"); else localStorage.removeItem(key);
  } catch { /* Storage restrictions do not change diagnostic truth. */ }
}

export async function syncPushSubscription(subscription: PushSubscription): Promise<PushDeviceRecord> {
  const result = await pushRequest<{ device: PushDeviceRecord }>("/api/calendar/push-subscription", subscription.toJSON());
  return result.device;
}

export async function inspectPushDevice(repair = true): Promise<{ diagnostics: PushDiagnostics; registration: ServiceWorkerRegistration | null }> {
  const diagnostics = emptyPushDiagnostics();
  let registration: ServiceWorkerRegistration | null = null;
  diagnostics.supported = isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!diagnostics.supported) return { diagnostics, registration };
  diagnostics.permission = Notification.permission;
  try {
    diagnostics.config = await pushRequest<PushServerConfig>("/api/calendar/push-subscription");
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    registration = await bounded(navigator.serviceWorker.ready, 8000, "Service Worker 尚未啟動，請重新開啟 App 後再同步。");
    diagnostics.workerScope = registration.scope;
    diagnostics.workerActive = registration.active?.state === "activated" && registration.scope === `${location.origin}/`;
    if (registration.active) diagnostics.workerVersion = await activeWorkerVersion(registration.active);
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription && repair && diagnostics.permission === "granted" && diagnostics.workerActive &&
      diagnostics.config.publicKey && !deviceOptedOut(diagnostics.config.accountId)) {
      // No requestPermission here. Safari may still require a gesture; show a repair button if rejected.
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(diagnostics.config.publicKey) });
    }
    diagnostics.subscriptionExists = Boolean(subscription);
    if (subscription) {
      diagnostics.keyMatches = subscriptionKeyMatches(subscription, diagnostics.config.publicKey);
      const result = await pushRequest<{ device: PushDeviceRecord | null }>("/api/calendar/push-subscription", { action: "inspect", endpoint: subscription.endpoint });
      diagnostics.server = result.device;
      if (repair && diagnostics.permission === "granted" && diagnostics.workerActive && diagnostics.keyMatches &&
        !deviceOptedOut(diagnostics.config.accountId) && result.device?.enabled !== false) {
        diagnostics.server = await syncPushSubscription(subscription);
      }
    }
  } catch (error) {
    diagnostics.error = error instanceof Error && error.name !== "AbortError" ? error.message : "通知檢查逾時，請重新同步。";
  }
  return { diagnostics, registration };
}
