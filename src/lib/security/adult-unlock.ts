import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getAnimePreferences } from "@/lib/anime/data";
import { hasAdultContentAccess } from "@/lib/security/adult-content";
import type { SecurityContext } from "@/lib/security/activity";

type Purpose = "adult-unlock" | "passkey-challenge";
type Payload = { purpose: Purpose; userId: string; sessionId: string; expiresAt: number; nonce: string };

function key() {
  const value = process.env.ADULT_UNLOCK_TOKEN_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!value) throw new Error("Adult unlock signing key is not configured.");
  return value;
}

function sign(payload: Payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", key()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function parse(value: string | null | undefined): Payload | null {
  if (!value || value.length > 1500) return null;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = createHmac("sha256", key()).update(encoded).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Payload;
    return payload.expiresAt > Date.now() && payload.expiresAt <= Date.now() + 2 * 60 * 60_000 &&
      typeof payload.userId === "string" && typeof payload.sessionId === "string" &&
      (payload.purpose === "adult-unlock" || payload.purpose === "passkey-challenge") ? payload : null;
  } catch { return null; }
}

export function issueAdultUnlock(context: SecurityContext) {
  return sign({ purpose: "adult-unlock", userId: context.userId, sessionId: context.sessionId,
    expiresAt: Date.now() + 2 * 60 * 60_000, nonce: randomUUID() });
}

export function issuePasskeyChallenge(context: SecurityContext) {
  return sign({ purpose: "passkey-challenge", userId: context.userId, sessionId: context.sessionId,
    expiresAt: Date.now() + 2 * 60_000, nonce: randomUUID() });
}

export function completedPasskeyChallenge(context: SecurityContext, challenge: string) {
  const payload = parse(challenge);
  return payload?.purpose === "passkey-challenge" && payload.userId === context.userId &&
    payload.sessionId !== context.sessionId &&
    (context.authMethods ?? []).some((method) => method === "webauthn" || method === "mfa/webauthn" || method === "passkey");
}

export function isAdultUnlockToken(context: SecurityContext, token: string | null | undefined) {
  const payload = parse(token);
  return payload?.purpose === "adult-unlock" && payload.userId === context.userId &&
    payload.sessionId === context.sessionId;
}

export async function hasUnlockedAdultAccess(context: SecurityContext, token: string | null | undefined) {
  if (!isAdultUnlockToken(context, token)) return false;
  const [permission, preferences] = await Promise.all([
    hasAdultContentAccess(context.userId), getAnimePreferences(context.userId),
  ]);
  return permission && preferences.adultModeEnabled;
}
