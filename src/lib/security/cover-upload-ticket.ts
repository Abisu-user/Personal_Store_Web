import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

export type CoverUploadTicket = { ownerId: string; storagePath: string; mimeType: string; byteSize: number; expiresAt: number };

function secret() {
  const value = process.env.SUPABASE_SECRET_KEY;
  if (!value) throw new Error("Storage security is not configured.");
  return value;
}

export function createCoverUploadTicket(payload: CoverUploadTicket) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret()).update(encoded).digest("base64url")}`;
}

export function verifyCoverUploadTicket(ticket: string) {
  const [encoded, signature] = ticket.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", secret()).update(encoded).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CoverUploadTicket;
    if (!payload.ownerId || !payload.storagePath || !payload.mimeType || payload.byteSize <= 0 || payload.byteSize > 5_242_880 || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch { return null; }
}
