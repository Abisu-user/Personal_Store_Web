import "server-only";
import type { PushConfiguration, PushTestOutcome, VapidValidationDiagnostics, VapidValueDiagnostics } from "./push-diagnostics";

type DispatchResult = { ok: boolean; code: string; providerStatus?: number; subscriptionId?: string; acceptedAt?: string;
  configuration?: PushConfiguration; vapidValidation?: VapidValidationDiagnostics } & Partial<PushTestOutcome>;

export function safeVapidValidation(value: unknown): VapidValidationDiagnostics | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const issues = new Set(["MISSING", "CONTAINS_QUOTES", "CONTAINS_WHITESPACE", "PEM_NOT_SUPPORTED", "INVALID_BASE64URL",
    "INVALID_DECODED_LENGTH", "INVALID_CONTACT_URI", "EXPECTED_UNCOMPRESSED_POINT", "P256_POINT_IMPORT_FAILED", "P256_PRIVATE_IMPORT_FAILED",
    "PUBLIC_KEY_NOT_ON_CURVE", "PUBLIC_KEY_P256_IMPORT_FAILED", "PRIVATE_KEY_SCALAR_OUT_OF_RANGE"]);
  function inspection(raw: unknown): VapidValueDiagnostics {
    const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return { exists: data.exists === true, length: typeof data.length === "number" && Number.isSafeInteger(data.length) && data.length >= 0 ? data.length : 0,
      leadingWhitespace: data.leadingWhitespace === true, trailingWhitespace: data.trailingWhitespace === true,
      containsWhitespace: data.containsWhitespace === true, containsNewline: data.containsNewline === true,
      containsQuotes: data.containsQuotes === true, formatValid: data.formatValid === true,
      issues: Array.isArray(data.issues) ? data.issues.filter((entry): entry is string => typeof entry === "string" && issues.has(entry)) : [] };
  }
  function key(raw: unknown, expectedFormat: VapidValidationDiagnostics["privateKey"]["expectedFormat"]) {
    const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return { ...inspection(data), base64urlValid: data.base64urlValid === true, structuralValid: data.structuralValid === true,
      expectedFormat, importValidation: data.importValidation === "valid" ? "valid" as const : data.importValidation === "invalid" ? "invalid" as const : "not-checked" as const,
      decodedLength: typeof data.decodedLength === "number" && Number.isSafeInteger(data.decodedLength) && data.decodedLength >= 0 ? data.decodedLength : null };
  }
  const fingerprintData = record.fingerprints && typeof record.fingerprints === "object" ? record.fingerprints as Record<string, unknown> : {};
  const fingerprint = (raw: unknown) => typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw) ? raw : null;
  const boolean = (raw: unknown) => typeof raw === "boolean" ? raw : null;
  const publicData = record.publicKey && typeof record.publicKey === "object" ? record.publicKey as Record<string, unknown> : {};
  const subjectData = record.subject && typeof record.subject === "object" ? record.subject as Record<string, unknown> : {};
  const uriType = subjectData.uriType === "https" || subjectData.uriType === "mailto" || subjectData.uriType === "unsupported" ? subjectData.uriType : "invalid";
  const failure = ["PUBLIC_KEY", "PRIVATE_KEY", "SUBJECT", "PAIR", "IMPORT", "LIBRARY"].includes(String(record.failure)) ? record.failure as VapidValidationDiagnostics["failure"] : null;
  return { publicKey: { ...key(record.publicKey, "raw-base64url-p256-public"),
      firstByte: typeof publicData.firstByte === "number" && Number.isInteger(publicData.firstByte) && publicData.firstByte >= 0 && publicData.firstByte <= 255 ? publicData.firstByte : null,
      pointOnCurve: boolean(publicData.pointOnCurve) },
    privateKey: key(record.privateKey, "raw-base64url-p256-private"), subject: { ...inspection(record.subject), uriType },
    pairMatch: boolean(record.pairMatch), publicKeyMatch: boolean(record.publicKeyMatch),
    fingerprints: { expectedPublic: fingerprint(fingerprintData.expectedPublic), edgePublic: fingerprint(fingerprintData.edgePublic) },
    libraryValidation: record.libraryValidation === "valid" || record.libraryValidation === "invalid" ? record.libraryValidation : "not-checked", failure };
}

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
    const vapidValidation = safeVapidValidation(result.vapidValidation);
    const validated = Boolean(vapidValidation?.publicKey.formatValid && vapidValidation.privateKey.formatValid &&
      vapidValidation.publicKey.structuralValid && vapidValidation.publicKey.firstByte === 4 && vapidValidation.publicKey.pointOnCurve === true &&
      vapidValidation.publicKey.importValidation === "valid" && vapidValidation.privateKey.structuralValid && vapidValidation.privateKey.importValidation === "valid" &&
      vapidValidation.subject.formatValid && vapidValidation.pairMatch === true && vapidValidation.publicKeyMatch === true &&
      vapidValidation.libraryValidation === "valid" && vapidValidation.failure === null);
    return { ok: response.ok && result.ok && accepted && validated,
      code: result.ok && !validated ? "EDGE_UPDATE_REQUIRED" : result.code,
      providerStatus: typeof result.providerStatus === "number" ? result.providerStatus : undefined,
      subscriptionId: typeof result.subscriptionId === "string" ? result.subscriptionId : undefined,
      acceptedAt: typeof result.acceptedAt === "string" ? result.acceptedAt : undefined,
      configuration: safeEdgeConfiguration(result.configuration),
      vapidValidation,
      serverConfigured: vapidValidation ? validated : result.serverConfigured === false ? false : null,
      subscriptionFound: typeof result.subscriptionFound === "boolean" ? result.subscriptionFound : null,
      pushAttempted: typeof result.pushAttempted === "boolean" ? result.pushAttempted : null,
      invalidSubscription: result.code === "SUBSCRIPTION_EXPIRED" };
  } catch {
    // Timeout cannot prove whether the Edge function already contacted the provider.
    return { ok: false, code: "DISPATCH_UNREACHABLE", serverConfigured: null, pushAttempted: null };
  }
}
