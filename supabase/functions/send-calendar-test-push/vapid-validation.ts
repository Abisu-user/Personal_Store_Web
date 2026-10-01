import { Buffer } from "node:buffer";
import { createECDH, createHash, timingSafeEqual } from "node:crypto";

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
type ImportValidation = "valid" | "invalid" | "not-checked";
export type KeyInspection = ValueInspection & {
  base64urlValid: boolean; decodedLength: number | null; structuralValid: boolean;
  expectedFormat: "raw-base64url-p256-public" | "raw-base64url-p256-private";
  importValidation: ImportValidation;
};
export type PublicKeyInspection = KeyInspection & { firstByte: number | null; pointOnCurve: boolean | null };
export type VapidValidation = {
  publicKey: PublicKeyInspection;
  privateKey: KeyInspection;
  subject: ValueInspection & { uriType: "https" | "mailto" | "unsupported" | "invalid" };
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
  const report: KeyInspection = { ...inspect(value), base64urlValid: false, decodedLength: null, structuralValid: false,
    expectedFormat: expectedLength === 65 ? "raw-base64url-p256-public" : "raw-base64url-p256-private", importValidation: "not-checked" };
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
  report.structuralValid = report.formatValid;
  return { report, bytes: report.formatValid ? bytes : null };
}

// Public-point equation only, not a signing/key-generation implementation. P-256 has cofactor 1.
// Older Deno stubs ECDH.convertKey, and some WebCrypto versions accept off-curve raw points.
// Check canonical coordinates before WebCrypto import without depending on either behavior.
const P256_P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
const P256_B = BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b");
const P256_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const integer = (bytes: Buffer) => BigInt("0x" + bytes.toString("hex"));
function pointOnP256(bytes: Buffer) {
  const x = integer(bytes.subarray(1, 33)), y = integer(bytes.subarray(33, 65));
  const mod = (value: bigint) => ((value % P256_P) + P256_P) % P256_P;
  return x < P256_P && y < P256_P && mod(y * y) === mod(x * x * x - BigInt(3) * x + P256_B);
}

export async function validateVapid(publicKey: string | undefined, privateKey: string | undefined,
  subject: string | undefined, expectedPublicKey: unknown): Promise<VapidValidation> {
  const publicValue = inspectKey(publicKey, 65), privateValue = inspectKey(privateKey, 32);
  const contact = inspect(subject);
  let uriType: VapidValidation["subject"]["uriType"] = "invalid";
  let contactValid = false;
  try {
    const uri = new URL(subject ?? "");
    uriType = uri.protocol === "https:" ? "https" : uri.protocol === "mailto:" ? "mailto" : "unsupported";
    contactValid = uri.protocol === "https:" ? Boolean(uri.hostname) && uri.hostname !== "localhost" && !uri.username && !uri.password :
      uri.protocol === "mailto:" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uri.pathname);
  } catch { /* Invalid contact URI. */ }
  if (!contactValid) contact.issues.push("INVALID_CONTACT_URI");
  contact.formatValid = contact.issues.length === 0;
  const expected = inspectKey(typeof expectedPublicKey === "string" ? expectedPublicKey : undefined, 65);
  const fingerprint = (bytes: Buffer | null) => bytes ? createHash("sha256").update(bytes).digest("hex") : null;
  const report: VapidValidation = { publicKey: { ...publicValue.report, firstByte: publicValue.bytes?.[0] ?? null, pointOnCurve: null },
    privateKey: privateValue.report, subject: { ...contact, uriType },
    pairMatch: null, publicKeyMatch: publicValue.bytes && expected.bytes ? timingSafeEqual(publicValue.bytes, expected.bytes) : null,
    fingerprints: { expectedPublic: fingerprint(expected.bytes), edgePublic: fingerprint(publicValue.bytes) },
    libraryValidation: "not-checked", failure: null };

  if (publicValue.bytes) {
    if (publicValue.bytes[0] !== 4) {
      report.publicKey.issues.push("EXPECTED_UNCOMPRESSED_POINT"); report.publicKey.formatValid = false;
      report.publicKey.structuralValid = false;
    } else {
      report.publicKey.pointOnCurve = pointOnP256(publicValue.bytes);
      if (!report.publicKey.pointOnCurve) {
        report.publicKey.issues.push("PUBLIC_KEY_NOT_ON_CURVE"); report.publicKey.formatValid = false;
      } else {
        try {
          await crypto.subtle.importKey("raw", new Uint8Array(publicValue.bytes), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
          report.publicKey.importValidation = "valid";
        } catch {
          report.publicKey.importValidation = "invalid";
          report.publicKey.issues.push("PUBLIC_KEY_P256_IMPORT_FAILED"); report.publicKey.formatValid = false;
        }
      }
    }
  }
  if (privateValue.bytes) {
    const scalar = integer(privateValue.bytes);
    if (scalar === BigInt(0) || scalar >= P256_N) {
      report.privateKey.issues.push("PRIVATE_KEY_SCALAR_OUT_OF_RANGE"); report.privateKey.formatValid = false;
    } else {
      try {
        // Same raw 32-byte private scalar/curve as web-push. Do not import an ECDSA private key as raw.
        const curve = createECDH("prime256v1"); curve.setPrivateKey(privateValue.bytes);
        const derived = curve.getPublicKey();
        await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256",
          x: derived.subarray(1, 33).toString("base64url"), y: derived.subarray(33, 65).toString("base64url"),
          d: privateValue.bytes.toString("base64url"), ext: false }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
        report.privateKey.importValidation = "valid";
        if (report.publicKey.formatValid && publicValue.bytes) report.pairMatch = timingSafeEqual(derived, publicValue.bytes);
      } catch {
        report.privateKey.importValidation = "invalid";
        report.privateKey.issues.push("P256_PRIVATE_IMPORT_FAILED"); report.privateKey.formatValid = false;
      }
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
