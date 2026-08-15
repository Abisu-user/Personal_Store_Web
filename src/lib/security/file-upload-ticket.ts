import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

export type FileUploadTicket = { ownerId: string; storagePath: string; originalFilename: string; mimeType: string; byteSize: number; sha256: string; expiresAt: number };

function signingSecret() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Server security storage is not configured.");
  return secret;
}

export function createFileUploadTicket(payload: FileUploadTicket) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyFileUploadTicket(ticket: string): FileUploadTicket | null {
  const [encoded, signature] = ticket.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", signingSecret()).update(encoded).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as FileUploadTicket;
    if (!payload.ownerId || !payload.storagePath || !payload.originalFilename || !/^[a-f0-9]{64}$/i.test(payload.sha256) || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch { return null; }
}
