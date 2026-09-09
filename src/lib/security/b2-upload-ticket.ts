import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import type { B2UploadPurpose } from "@/lib/storage/b2-upload-policy";

export type B2UploadTicket = {
  ownerId: string;
  storageObjectId: string;
  bucket: string;
  objectKey: string;
  purpose: B2UploadPurpose;
  byteSize: number;
  mimeType: string;
  sha256: string | null;
  expiresAt: number;
};

function signingSecret() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Server security storage is not configured.");
  return secret;
}

function signature(encoded: string) {
  return createHmac("sha256", signingSecret()).update(`b2-upload-v1.${encoded}`).digest();
}

export function createB2UploadTicket(payload: B2UploadTicket) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded).toString("base64url")}`;
}

export function verifyB2UploadTicket(ticket: string): B2UploadTicket | null {
  const [encoded, supplied] = ticket.split(".");
  if (!encoded || !supplied) return null;
  const received = Buffer.from(supplied, "base64url");
  const expected = signature(encoded);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as B2UploadTicket;
    if (!/^[0-9a-f-]{36}$/i.test(value.ownerId) || !/^[0-9a-f-]{36}$/i.test(value.storageObjectId)) return null;
    if (!value.objectKey.startsWith(`${value.ownerId}/`) || !value.bucket || !value.purpose) return null;
    if (!Number.isSafeInteger(value.byteSize) || value.byteSize <= 0 || !value.mimeType || value.expiresAt < Date.now()) return null;
    if (value.sha256 !== null && !/^[a-f0-9]{64}$/.test(value.sha256)) return null;
    return value;
  } catch {
    return null;
  }
}
