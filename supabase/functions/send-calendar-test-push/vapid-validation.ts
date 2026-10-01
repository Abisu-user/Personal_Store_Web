import { Buffer } from "node:buffer";
import { ECDH, createECDH, createHash, timingSafeEqual } from "node:crypto";

/** Safe metadata only. Never attach input values or raw library exceptions to this result. */
export type ValueInspection = {
  exists: boolean;
  length: number;
  leadingWhitespace: boolean;
  trailingWhitespace: boolean;
  containsWhitespace: boolean;
  containsNewline: boolean;
  containsQuotes: boolean;
  formatValid: boolean;
  issues: string[];
};
export type KeyInspection = ValueInspection & { base64urlValid: boolean; decodedLength: number | null };
export type VapidValidation = {
  publicKey: KeyInspection;
  privateKey: KeyInspection;
  subject: ValueInspection;
  pairMatch: boolean | null;
  publicKeyMatch: boolean | null;
  fingerprints: { expectedPublic: string | null; edgePublic: string | null };
  libraryValidation: "valid" | "invalid" | "not-checked";
  failure: "PUBLIC_KEY" | "PRIVATE_KEY" | "SUBJECT" | "PAIR" | "IMPORT" | "LIBRARY" | null;
};

function inspect(value: string | undefined): ValueInspection {
  const text = value ?? "";
  const report: ValueInspection = { exists: Boolean(text), length: text.length,
    leadingWhitespace: /^\s/.test(text), trailingWhitespace: /\s$/.test(text),
    containsWhitespace: /\s/.test(text), containsNewline: /[\r\n]/.test(text),
    containsQuotes: /["']/.test(text), formatValid: false, issues: [] };
  if (!report.exists) report.issues.push("MISSING");
  if (report.containsQuotes) report.issues.push("CONTAINS_QUOTES");
  if (report.containsWhitespace) report.issues.push("CONTAINS_WHITESPACE");
  return report;
}

function inspectKey(value: string | undefined, expectedLength: number) {
  const report: KeyInspection = { ...inspect(value), base64urlValid: false, decodedLength: null };
  let bytes: Buffer | null = null;
  // web-push 3.6.7 explicitly rejects +, / and =. Do not silently transform or trim secrets.
  if (value && value.length <= 256 && /^[A-Za-z0-9_-]+$/.test(value)) {
    try {
      bytes = Buffer.from(value, "base64url");
      report.decodedLength = bytes.length;
      report.base64urlValid = bytes.toString("base64url") === value;
    } catch { /* Report a category, never the thrown error/value. */ }
  }
  if (value?.includes("-----BEGIN")) report.issues.push("PEM_NOT_SUPPORTED");
  if (!report.base64urlValid) report.issues.push("INVALID_BASE64URL");
  if (report.base64urlValid && report.decodedLength !== expectedLength) report.issues.push("INVALID_DECODED_LENGTH");
  report.formatValid = report.issues.length === 0;
  return { report, bytes: report.formatValid ? bytes : null };
}

export async function validateVapid(publicKey: string | undefined, privateKey: string | undefined,
  subject: string | undefined, expectedPublicKey: unknown): Promise<VapidValidation> {
  const publicValue = inspectKey(publicKey, 65), privateValue = inspectKey(privateKey, 32);
  const contact = inspect(subject);
  let contactValid = false;
  try {
    const uri = new URL(subject ?? "");
    contactValid = uri.protocol === "https:" ? Boolean(uri.hostname) && uri.hostname !== "localhost" && !uri.username && !uri.password :
      uri.protocol === "mailto:" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uri.pathname);
  } catch { /* Invalid contact URI. */ }
  if (!contactValid) contact.issues.push("INVALID_CONTACT_URI");
  contact.formatValid = contact.issues.length === 0;
  const expected = inspectKey(typeof expectedPublicKey === "string" ? expectedPublicKey : undefined, 65);
  const fingerprint = (bytes: Buffer | null) => bytes ? createHash("sha256").update(bytes).digest("hex") : null;
  const report: VapidValidation = { publicKey: publicValue.report, privateKey: privateValue.report, subject: contact,
    pairMatch: null, publicKeyMatch: publicValue.bytes && expected.bytes ? timingSafeEqual(publicValue.bytes, expected.bytes) : null,
    fingerprints: { expectedPublic: fingerprint(expected.bytes), edgePublic: fingerprint(publicValue.bytes) },
    libraryValidation: "not-checked", failure: null };

  if (publicValue.bytes) {
    if (publicValue.bytes[0] !== 4) {
      report.publicKey.issues.push("EXPECTED_UNCOMPRESSED_POINT"); report.publicKey.formatValid = false;
    } else {
      try {
        // Some WebCrypto runtimes defer on-curve validation until an operation. Check it explicitly too.
        ECDH.convertKey(publicValue.bytes, "prime256v1");
        // Import validates a real point on P-256, not just a regex or decoded byte count.
        await crypto.subtle.importKey("raw", new Uint8Array(publicValue.bytes), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      } catch {
        report.publicKey.issues.push("P256_POINT_IMPORT_FAILED"); report.publicKey.formatValid = false;
      }
    }
  }
  if (privateValue.bytes) {
    try {
      // Same prime256v1 curve as web-push; rejects zero/out-of-range private scalars.
      const curve = createECDH("prime256v1"); curve.setPrivateKey(privateValue.bytes);
      const derived = curve.getPublicKey();
      if (report.publicKey.formatValid && publicValue.bytes) report.pairMatch = timingSafeEqual(derived, publicValue.bytes);
    } catch {
      report.privateKey.issues.push("P256_PRIVATE_IMPORT_FAILED"); report.privateKey.formatValid = false;
    }
  }
  report.failure = !report.publicKey.formatValid ? "PUBLIC_KEY" : !report.privateKey.formatValid ? "PRIVATE_KEY" :
    !contact.formatValid ? "SUBJECT" : report.pairMatch === false ? "PAIR" : report.pairMatch !== true ? "IMPORT" : null;
  return report;
}

/** web-push errors can embed secrets. Match known categories but never expose message/stack. */
export function libraryFailure(error: unknown): NonNullable<VapidValidation["failure"]> {
  const message = error instanceof Error ? error.message : "";
  if (/subject|mailto/i.test(message)) return "SUBJECT";
  if (/public key|publicKey/i.test(message)) return "PUBLIC_KEY";
  if (/private key|privateKey/i.test(message)) return "PRIVATE_KEY";
  return "LIBRARY";
}
